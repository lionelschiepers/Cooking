/**
 * Checks this repository's dependencies, pnpm version and SHA-pinned GitHub
 * Actions against their latest releases.
 *
 *   node .agents/skills/project-update/project-update.js [options]
 *
 * Without --write it only reports. --check runs the offline regression suite
 * in references.json. Run with --help for the options.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { isDeepStrictEqual, parseArgs, promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SKILL_DIR, '../../..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');
const SKILL_MD = path.join(SKILL_DIR, 'SKILL.md');
const REFERENCES = path.join(SKILL_DIR, 'references.json');
const USER_AGENT = 'project-update-skill';
const execFileAsync = promisify(execFile);
const USES_RE =
  /^(\s*(?:-\s+)?uses:\s*)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)(\s*#\s*(\S+))?(\s*)$/;

const USAGE = `Usage: node .agents/skills/project-update/project-update.js [options]

  --write          Apply the updates (default: report only)
  --skip <a,b>     Names to leave alone (package name or owner/repo)
  --check          Run the offline regression checks in references.json
  --learn "<text>" Append a dated finding to SKILL.md and exit
  --help           Show this help

Updates dependencies and devDependencies in package.json, the pnpm
"packageManager" version, and every SHA-pinned action in .github/workflows.
It does not run pnpm install or the build.`;

const { values: opts } = parseArgs({
  options: {
    write: { type: 'boolean', default: false },
    skip: { type: 'string', default: '' },
    check: { type: 'boolean', default: false },
    learn: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}

const skip = new Set(
  opts.skip
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const errors = [];

function requestJson(url) {
  return fetch(url, { headers: { 'User-Agent': USER_AGENT } }).then(
    async (response) => {
      if (!response.ok) {
        const error = new Error(
          `${response.status} ${response.statusText}: ${url}`,
        );
        error.status = response.status;
        throw error;
      }
      return response.json();
    },
  );
}

async function git(args) {
  const { stdout } = await execFileAsync('git', args, {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function parseVersion(value) {
  const match = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(value || '');
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function compareVersions(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

function bumpType(current, latest) {
  if (current.major !== latest.major) return 'major';
  if (current.minor !== latest.minor) return 'minor';
  return 'patch';
}

function isStable(version) {
  return !String(version).includes('-');
}

function nextSpec(spec, latest) {
  const prefix = spec.startsWith('~') ? '~' : spec.startsWith('^') ? '^' : '';
  return `${prefix}${latest}`;
}

function parseUseLine(line) {
  const match = USES_RE.exec(line);
  if (!match) return null;

  return {
    prefix: match[1],
    repo: match[2],
    ref: match[3],
    comment: match[5] || '',
    suffix: match[6],
  };
}

function renderActionUse(update) {
  return `${update.prefix}${update.repo}@${update.sha} # ${update.tag}${update.suffix}`;
}

function tagFromReleaseUrl(url) {
  try {
    const match = /\/releases\/tag\/(.+)$/.exec(new URL(url).pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function pickCommit(output, tag) {
  const lines = output
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([sha, ref]) => sha && ref);
  const peeled = lines.find(([, ref]) => ref === `refs/tags/${tag}^{}`);
  const direct = lines.find(([, ref]) => ref === `refs/tags/${tag}`);
  const found = peeled || direct;

  if (!found) throw new Error(`tag ${tag} not found`);
  return found[0];
}

function isCurrentPin(ref, comment, sha, tag) {
  return (
    /^[0-9a-f]{40}$/i.test(ref) &&
    ref.toLowerCase() === sha.toLowerCase() &&
    comment === tag
  );
}

/**
 * Self-checks. Every case in references.json names one of these functions and
 * compares its result with the expected value. They must stay pure and offline.
 */
const CHECKS = {
  parseVersion,
  compareVersions: ({ a, b }) =>
    compareVersions(parseVersion(a), parseVersion(b)),
  bumpType: ({ current, latest }) =>
    bumpType(parseVersion(current), parseVersion(latest)),
  isStable,
  nextSpec: ({ spec, latest }) => nextSpec(spec, latest),
  parseUseLine,
  renderActionUse,
  tagFromReleaseUrl,
  pickCommit: ({ output, tag }) => pickCommit(output, tag),
  isCurrentPin: ({ ref, comment, sha, tag }) =>
    isCurrentPin(ref, comment, sha, tag),
};

function runSelfChecks() {
  let failures = 0;
  const checks = JSON.parse(fs.readFileSync(REFERENCES, 'utf8')).checks || [];
  const ids = new Set();

  const fail = (label, detail) => {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail) console.log(`        ${detail}`);
  };
  const pass = (label) => console.log(`  ok    ${label}`);

  console.log('Self-check');
  for (const check of checks) {
    if (!check.id || ids.has(check.id)) {
      fail(check.id || '(missing id)', 'id is missing or duplicated');
      continue;
    }
    ids.add(check.id);

    if (!check.why) {
      fail(check.id, 'why is missing');
    } else if (!CHECKS[check.fn]) {
      fail(check.id, `unknown fn: ${check.fn}`);
    } else if (!Object.hasOwn(check, 'input')) {
      fail(check.id, 'input is missing');
    } else if (!Object.hasOwn(check, 'expect')) {
      fail(check.id, 'expect is missing');
    } else {
      try {
        const actual = CHECKS[check.fn](check.input);
        if (isDeepStrictEqual(actual, check.expect)) pass(check.id);
        else
          fail(
            check.id,
            `expected ${JSON.stringify(check.expect)}, received ${JSON.stringify(actual)}`,
          );
      } catch (error) {
        fail(check.id, error.message);
      }
    }
  }

  const skill = fs.readFileSync(SKILL_MD, 'utf8');
  const hygiene = [
    ['SKILL.md uses LF line endings', !skill.includes('\r\n')],
    ['SKILL.md has a Findings section', /^## Findings$/m.test(skill)],
    [
      'SKILL.md has at least one dated finding',
      /^- \d{4}-\d{2}-\d{2}: \S/m.test(skill),
    ],
    ['references.json has at least one check', checks.length > 0],
  ];

  for (const [label, ok] of hygiene) {
    if (ok) pass(label);
    else fail(label);
  }

  console.log('');
  if (failures > 0) {
    console.log(`${failures} self-check(s) failed.`);
    return 1;
  }
  console.log(`All ${checks.length + hygiene.length} self-checks passed.`);
  return 0;
}

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function learn(text) {
  const finding = text.trim().replace(/\s+/g, ' ');
  if (!finding) throw new Error('--learn needs a one-line finding');

  const entry = `- ${today()}: ${finding}`;
  const skill = fs.readFileSync(SKILL_MD, 'utf8');
  if (skill.split('\n').includes(entry)) {
    console.log('Already recorded.');
    return;
  }

  const heading = '\n## Findings\n';
  const start = skill.indexOf(heading);
  if (start < 0) throw new Error('SKILL.md has no "## Findings" section');

  const next = skill.indexOf('\n## ', start + heading.length);
  const head = next < 0 ? skill : skill.slice(0, next);
  const tail = next < 0 ? '' : skill.slice(next);
  const separator = head.endsWith('\n') ? '' : '\n';

  fs.writeFileSync(SKILL_MD, `${head}${separator}${entry}\n${tail}`);
  console.log(`Recorded: ${entry}`);
}

if (opts.check) {
  process.exit(runSelfChecks());
}

if (opts.learn !== undefined) {
  try {
    learn(opts.learn);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  process.exit(0);
}

async function checkPackages(pkg) {
  const updates = [];

  for (const field of ['dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(pkg[field] || {})) {
      if (skip.has(name)) continue;

      const current = parseVersion(spec.replace(/^[~^]/, ''));
      if (!current) continue;

      try {
        const latest = (
          await requestJson(
            `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
          )
        ).version;
        const next = parseVersion(latest);
        if (!next || compareVersions(current, next) >= 0) continue;

        updates.push({
          name,
          field,
          spec,
          latest,
          next: nextSpec(spec, latest),
          type: bumpType(current, next),
        });
      } catch (error) {
        errors.push(`${name}: ${error.message}`);
      }
    }
  }

  return updates;
}

async function checkPackageManager(pkg) {
  const match = /^pnpm@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(
    pkg.packageManager || '',
  );
  if (!match || skip.has('pnpm')) return null;

  try {
    const latest = (await requestJson('https://registry.npmjs.org/pnpm/latest'))
      .version;
    const current = parseVersion(match[1]);
    const next = parseVersion(latest);
    if (!next || compareVersions(current, next) >= 0) return null;

    return {
      current: match[1],
      latest,
      type: bumpType(current, next),
    };
  } catch (error) {
    errors.push(`pnpm: ${error.message}`);
    return null;
  }
}

function findActionUses() {
  if (!fs.existsSync(WORKFLOWS_DIR)) return [];

  const uses = [];
  for (const file of fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((name) => /\.ya?ml$/i.test(name))) {
    const fullPath = path.join(WORKFLOWS_DIR, file);
    const lines = fs.readFileSync(fullPath, 'utf8').split('\n');

    lines.forEach((line, index) => {
      const parsed = parseUseLine(line);
      if (!parsed) return;

      uses.push({
        ...parsed,
        file: fullPath,
        relative: path.relative(ROOT, fullPath),
        index,
      });
    });
  }

  return uses;
}

async function latestReleaseTag(repo) {
  try {
    const response = await fetch(`https://github.com/${repo}/releases/latest`, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    if (response.ok) {
      const tag = tagFromReleaseUrl(response.url);
      if (tag) return tag;
    }
  } catch {
    // Fall back to the highest tag below.
  }

  const output = await git([
    'ls-remote',
    '--tags',
    '--refs',
    `https://github.com/${repo}.git`,
  ]);
  const versions = output
    .split('\n')
    .map((line) => line.split('\t')[1])
    .filter(Boolean)
    .map((ref) => ref.replace('refs/tags/', ''))
    .map((tag) => ({ tag, version: parseVersion(tag) }))
    .filter((tag) => tag.version)
    .sort((a, b) => compareVersions(b.version, a.version));

  return versions[0]?.tag || null;
}

async function resolveCommit(repo, tag) {
  const output = await git([
    'ls-remote',
    '--tags',
    `https://github.com/${repo}.git`,
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);
  return pickCommit(output, tag);
}

async function checkActions() {
  const updates = [];

  for (const use of findActionUses()) {
    if (skip.has(use.repo)) continue;

    try {
      const tag = await latestReleaseTag(use.repo);
      if (!tag) continue;

      const sha = await resolveCommit(use.repo, tag);
      if (isCurrentPin(use.ref, use.comment, sha, tag)) continue;

      updates.push({
        ...use,
        tag,
        sha,
        pinned: /^[0-9a-f]{40}$/i.test(use.ref),
        type: /^[0-9a-f]{40}$/i.test(use.ref) ? 'update' : 'pin',
      });
    } catch (error) {
      errors.push(`${use.repo}: ${error.message}`);
    }
  }

  return updates;
}

async function checkNode() {
  try {
    const releases = await requestJson('https://nodejs.org/dist/index.json');
    return {
      newest:
        releases.find((release) => isStable(release.version))?.version || null,
      lts: releases.find((release) => release.lts) || null,
    };
  } catch (error) {
    errors.push(`node: ${error.message}`);
    return null;
  }
}

function describeNode(pkg, nodeInfo) {
  if (!nodeInfo) return;

  const workflowVersions = [];
  if (fs.existsSync(WORKFLOWS_DIR)) {
    for (const file of fs
      .readdirSync(WORKFLOWS_DIR)
      .filter((name) => /\.ya?ml$/i.test(name))) {
      const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
      for (const match of content.matchAll(
        /node-version:\s*['"]?([^'"\s]+)['"]?/g,
      )) {
        workflowVersions.push(match[1]);
      }
    }
  }

  const lts = nodeInfo.lts
    ? `${nodeInfo.lts.version} (${nodeInfo.lts.lts})`
    : 'none';
  console.log('Node.js');
  console.log(`  newest release: ${nodeInfo.newest || 'unknown'}`);
  console.log(`  latest LTS:     ${lts}`);
  console.log(`  engines.node:   ${pkg.engines?.node || 'not set'}`);
  console.log(
    `  workflows:      ${workflowVersions.length ? workflowVersions.join(', ') : 'not pinned'}`,
  );
  console.log('');
}

function report(packageUpdates, managerUpdate, actionUpdates) {
  console.log('Packages');
  if (packageUpdates.length === 0) {
    console.log('  up to date');
  } else {
    for (const update of packageUpdates) {
      console.log(
        `  ${update.name.padEnd(38)} ${update.spec.padEnd(12)} -> ${update.next} (${update.type})`,
      );
    }
  }

  console.log('');
  console.log('Package manager');
  console.log(
    managerUpdate
      ? `  pnpm ${managerUpdate.current} -> ${managerUpdate.latest} (${managerUpdate.type})`
      : '  up to date',
  );

  console.log('');
  console.log('GitHub Actions');
  if (actionUpdates.length === 0) {
    console.log('  up to date');
  } else {
    for (const update of actionUpdates) {
      const current = update.pinned ? update.comment || 'SHA' : update.ref;
      console.log(
        `  ${update.repo.padEnd(38)} ${current.padEnd(12)} -> ${update.tag} (${update.type})`,
      );
      console.log(`    ${update.relative}`);
    }
  }
}

function applyPackageUpdates(pkg, packageUpdates, managerUpdate) {
  for (const update of packageUpdates) {
    pkg[update.field][update.name] = update.next;
  }
  if (managerUpdate) pkg.packageManager = `pnpm@${managerUpdate.latest}`;
  fs.writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
}

function applyActionUpdates(actionUpdates) {
  const byFile = new Map();
  for (const update of actionUpdates) {
    if (!byFile.has(update.file)) byFile.set(update.file, []);
    byFile.get(update.file).push(update);
  }

  for (const [file, updates] of byFile) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (const update of updates) lines[update.index] = renderActionUse(update);
    fs.writeFileSync(file, lines.join('\n'));
  }
}

const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
const [packageUpdates, managerUpdate, actionUpdates, nodeInfo] =
  await Promise.all([
    checkPackages(pkg),
    checkPackageManager(pkg),
    checkActions(),
    checkNode(),
  ]);

report(packageUpdates, managerUpdate, actionUpdates);
console.log('');
describeNode(pkg, nodeInfo);

const total =
  packageUpdates.length + actionUpdates.length + (managerUpdate ? 1 : 0);
if (total === 0) {
  console.log('Everything is up to date.');
} else if (opts.write) {
  applyPackageUpdates(pkg, packageUpdates, managerUpdate);
  applyActionUpdates(actionUpdates);
  console.log(
    `Updated ${total} entr${total === 1 ? 'y' : 'ies'}. Run pnpm install and the build.`,
  );
} else {
  console.log(
    `${total} update${total === 1 ? '' : 's'} available. Re-run with --write to apply them.`,
  );
}

if (errors.length > 0) {
  console.log('');
  console.log('Errors');
  for (const error of errors) console.log(`  ${error}`);
  process.exitCode = 1;
}

console.log('');
console.log(
  'Self-improvement: record a finding with --learn "<what this run taught>", then run --check.',
);
