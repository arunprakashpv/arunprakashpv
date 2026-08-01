// ============ Theme config ============
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

// Initialize theme
(function() {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else if (systemPrefersDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

// ============ Mode config ============

const MODES = {
  standard: { reserved: 2, minPrefix: 30, label: 'Standard', full: 'Standard / On-prem / K8s' },
  gcp:      { reserved: 4, minPrefix: 29, label: 'GCP', full: 'Google Cloud Platform' },
  aws:      { reserved: 5, minPrefix: 28, label: 'AWS/Azure', full: 'AWS / Azure' },
};

function currentMode() {
  return document.getElementById('global-mode').value;
}

function currentModeConfig() {
  return MODES[currentMode()];
}

// ============ CIDR math primitives ============

function ipToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) throw new Error('Invalid IP: expected 4 octets');
  let n = 0;
  for (const p of parts) {
    const v = parseInt(p, 10);
    if (isNaN(v) || v < 0 || v > 255) throw new Error(`Invalid octet: ${p}`);
    n = (n * 256) + v;
  }
  return n >>> 0;
}

function intToIp(n) {
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}

function parseCidr(input) {
  const s = input.trim();
  if (!s.includes('/')) throw new Error('Missing prefix. Use format like 10.0.0.0/24');
  const [ipStr, prefixStr] = s.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error('Prefix must be 0-32');
  const ip = ipToInt(ipStr);
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  const network = (ip & mask) >>> 0;
  return { ip, prefix, mask, network };
}

function cidrInfo(cidr, mode) {
  const { prefix, mask, network } = parseCidr(cidr);
  const totalAddresses = prefix === 32 ? 1 : Math.pow(2, 32 - prefix);
  const broadcast = prefix === 32 ? network : (network + totalAddresses - 1) >>> 0;
  const reserved = MODES[mode].reserved;
  let usable;
  if (prefix === 32) usable = 1;
  else if (prefix === 31) usable = 2;
  else if (totalAddresses <= reserved) usable = 0;
  else usable = totalAddresses - reserved;
  const firstUsable = (prefix >= 31) ? network : (network + 1) >>> 0;
  const lastUsable = (prefix >= 31) ? broadcast : (broadcast - 1) >>> 0;
  return { input: cidr, prefix, mask, network, broadcast, totalAddresses, usable, firstUsable, lastUsable, reserved, mode };
}

function classify(ip) {
  const n = ipToInt(ip);
  if ((n & 0xff000000) >>> 0 === 0x0a000000) return { type: 'private', note: 'RFC 1918 (10.0.0.0/8)' };
  if (n >= ipToInt('172.16.0.0') && n <= ipToInt('172.31.255.255')) return { type: 'private', note: 'RFC 1918 (172.16.0.0/12)' };
  if ((n & 0xffff0000) >>> 0 === 0xc0a80000) return { type: 'private', note: 'RFC 1918 (192.168.0.0/16)' };
  if ((n & 0xff000000) >>> 0 === 0x7f000000) return { type: 'special', note: 'Loopback (127.0.0.0/8)' };
  if ((n & 0xffff0000) >>> 0 === 0xa9fe0000) return { type: 'special', note: 'Link-local (169.254.0.0/16)' };
  if (n >= ipToInt('224.0.0.0') && n <= ipToInt('239.255.255.255')) return { type: 'special', note: 'Multicast (Class D)' };
  if (n >= ipToInt('240.0.0.0')) return { type: 'special', note: 'Reserved (Class E)' };
  if (n === 0) return { type: 'special', note: 'Default route / any' };
  return { type: 'public', note: 'Publicly routable' };
}

function containsCheck(bigCidr, smallCidr) {
  const b = parseCidr(bigCidr);
  const s = parseCidr(smallCidr);
  if (s.prefix < b.prefix) return { fits: false, reason: 'smaller-prefix' };
  const sMaskedByB = (s.network & b.mask) >>> 0;
  return { fits: sMaskedByB === b.network, reason: 'match' };
}

function overlapCheck(a, b) {
  const A = parseCidr(a);
  const B = parseCidr(b);
  const aEnd = (A.network + Math.pow(2, 32 - A.prefix) - 1) >>> 0;
  const bEnd = (B.network + Math.pow(2, 32 - B.prefix) - 1) >>> 0;
  return !(aEnd < B.network || bEnd < A.network);
}

function splitNetwork(cidr, n) {
  const { network, prefix } = parseCidr(cidr);
  if (n < 2) throw new Error('Need at least 2 subnets');
  const bitsNeeded = Math.ceil(Math.log2(n));
  const newPrefix = prefix + bitsNeeded;
  if (newPrefix > 32) throw new Error(`Cannot split /${prefix} into ${n} — not enough bits`);
  const actualCount = Math.pow(2, bitsNeeded);
  const size = Math.pow(2, 32 - newPrefix);
  const subnets = [];
  for (let i = 0; i < n && i < actualCount; i++) {
    const start = (network + (i * size)) >>> 0;
    subnets.push({ cidr: `${intToIp(start)}/${newPrefix}`, network: start, size });
  }
  return { bitsNeeded, newPrefix, actualCount, requested: n, subnets, size };
}

function smallestCidrFor(hosts, mode) {
  const reserved = MODES[mode].reserved;
  const minPrefix = MODES[mode].minPrefix;
  const total = hosts + reserved;
  if (total <= 2) return { prefix: Math.min(31, minPrefix), addresses: 2, usable: 2 };
  const bits = Math.ceil(Math.log2(total));
  let prefix = 32 - bits;
  let hitMin = false;
  if (prefix > minPrefix) {
    prefix = minPrefix;
    hitMin = true;
  }
  return {
    prefix,
    addresses: Math.pow(2, 32 - prefix),
    usable: Math.pow(2, 32 - prefix) - reserved,
    hitMin,
  };
}

function cidrToMask(prefix) {
  if (prefix === 0) return '0.0.0.0';
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return intToIp(mask);
}

function maskToCidr(maskStr) {
  const n = ipToInt(maskStr);
  const binary = n.toString(2).padStart(32, '0');
  if (!/^1*0*$/.test(binary)) throw new Error(`Invalid mask: ${maskStr}. Mask must be contiguous 1s followed by 0s.`);
  return (binary.match(/1/g) || []).length;
}

function toBinaryIp(n) {
  const bin = n.toString(2).padStart(32, '0');
  return `${bin.slice(0,8)}.${bin.slice(8,16)}.${bin.slice(16,24)}.${bin.slice(24,32)}`;
}

// ============ UI helpers ============

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.section').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(t.dataset.tab).classList.add('active');
  });
});

function showResult(id, text, cls = '') {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'result ' + cls;
}

function showExplain(id, html) {
  const el = document.getElementById(id);
  el.innerHTML = html;
  el.className = 'explain';
}

function showError(id, msg) {
  showResult(id, msg, 'bad');
  const explainId = id.replace('-result', '-explain');
  const el = document.getElementById(explainId);
  if (el) el.className = 'explain hidden';
}

function onModeChange() {
  const label = currentModeConfig().label;
  ['inspect-badge', 'split-badge', 'size-badge', 'builder-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
  runInspect();
}

// ============ Handlers ============

function runInspect() {
  try {
    const cidr = document.getElementById('inspect-cidr').value;
    const mode = currentMode();
    const info = cidrInfo(cidr, mode);
    const cls = classify(intToIp(info.network));
    const lines = [
      `Input             ${info.input}`,
      `Mode              ${MODES[mode].full} (${info.reserved} reserved)`,
      ``,
      `Network address   ${intToIp(info.network)}`,
      `Broadcast         ${intToIp(info.broadcast)}`,
      `Subnet mask       ${intToIp(info.mask)}`,
      `Prefix            /${info.prefix}`,
      `Wildcard mask     ${intToIp((~info.mask) >>> 0)}`,
      `Total addresses   ${info.totalAddresses.toLocaleString()}`,
      `Usable hosts      ${info.usable.toLocaleString()}`,
      `First usable      ${intToIp(info.firstUsable)}`,
      `Last usable       ${intToIp(info.lastUsable)}`,
      `Classification    ${cls.type.toUpperCase()} — ${cls.note}`,
      ``,
      `Binary breakdown:`,
      `Network:   ${toBinaryIp(info.network)}`,
      `Mask:      ${toBinaryIp(info.mask)}`,
    ];
    showResult('inspect-result', lines.join('\n'), 'good');
    showExplain('inspect-explain',
      `<strong>How this is computed:</strong> The mask <code>${intToIp(info.mask)}</code> has ${info.prefix} leading 1-bits. ` +
      `Bitwise-AND the input IP with the mask to get the network address. Broadcast is network + (2<sup>${32-info.prefix}</sup> − 1). ` +
      `Usable hosts = 2<sup>${32-info.prefix}</sup> − ${info.reserved} (${MODES[mode].full}).`);
  } catch (e) { showError('inspect-result', e.message); }
}

function runFits() {
  try {
    const a = document.getElementById('fits-a').value;
    const b = document.getElementById('fits-b').value;
    const A = parseCidr(a);
    const B = parseCidr(b);
    const result = containsCheck(b, a);
    const aEnd = (A.network + Math.pow(2, 32 - A.prefix) - 1) >>> 0;
    const bEnd = (B.network + Math.pow(2, 32 - B.prefix) - 1) >>> 0;
    if (result.fits) {
      showResult('fits-result',
        `YES — ${a} fits inside ${b}\n\n` +
        `${a}  covers  ${intToIp(A.network)} → ${intToIp(aEnd)}\n` +
        `${b}  covers  ${intToIp(B.network)} → ${intToIp(bEnd)}`,
        'good');
      showExplain('fits-explain',
        `<strong>Why:</strong> /${A.prefix} is smaller than /${B.prefix} (bigger CIDR number = smaller network), and the network bits match when you apply B's mask to A's network address.`);
    } else {
      const reason = A.prefix < B.prefix
        ? `${a} is a LARGER network than ${b} (/${A.prefix} < /${B.prefix}). A bigger network can't fit inside a smaller one.`
        : `The network bits don't match. ${a} sits outside the range of ${b}.`;
      showResult('fits-result',
        `NO — ${a} does NOT fit inside ${b}\n\n` +
        `${a}  covers  ${intToIp(A.network)} → ${intToIp(aEnd)}\n` +
        `${b}  covers  ${intToIp(B.network)} → ${intToIp(bEnd)}`,
        'bad');
      showExplain('fits-explain', `<strong>Why:</strong> ${reason}`);
    }
  } catch (e) { showError('fits-result', e.message); }
}

function runOverlap() {
  try {
    const a = document.getElementById('overlap-a').value;
    const b = document.getElementById('overlap-b').value;
    const A = parseCidr(a);
    const B = parseCidr(b);
    const overlaps = overlapCheck(a, b);
    const aEnd = (A.network + Math.pow(2, 32 - A.prefix) - 1) >>> 0;
    const bEnd = (B.network + Math.pow(2, 32 - B.prefix) - 1) >>> 0;
    if (overlaps) {
      showResult('overlap-result',
        `OVERLAP DETECTED\n\n` +
        `${a}  covers  ${intToIp(A.network)} → ${intToIp(aEnd)}\n` +
        `${b}  covers  ${intToIp(B.network)} → ${intToIp(bEnd)}\n\n` +
        `These will conflict in routing / VPC peering / firewall rules.`,
        'bad');
      showExplain('overlap-explain', `<strong>Why this matters:</strong> Overlapping CIDRs cannot coexist in peered VPCs, connected VPNs, or the same route table. Cloud VPC peering will fail with an overlap error.`);
    } else {
      showResult('overlap-result',
        `NO OVERLAP\n\n` +
        `${a}  covers  ${intToIp(A.network)} → ${intToIp(aEnd)}\n` +
        `${b}  covers  ${intToIp(B.network)} → ${intToIp(bEnd)}\n\n` +
        `Safe to peer, route between, or use in the same environment.`,
        'good');
      showExplain('overlap-explain', `<strong>Why:</strong> The two ranges don't share any addresses.`);
    }
  } catch (e) { showError('overlap-result', e.message); }
}

function runSplit() {
  try {
    const parent = document.getElementById('split-parent').value;
    const n = parseInt(document.getElementById('split-n').value, 10);
    const mode = currentMode();
    const result = splitNetwork(parent, n);
    const P = parseCidr(parent);
    const minPrefix = MODES[mode].minPrefix;
    const lines = [`Split ${parent} into ${n} subnet${n>1?'s':''} (${MODES[mode].full}):`, ``];
    let violatesMin = false;
    result.subnets.forEach((s, i) => {
      const info = cidrInfo(s.cidr, mode);
      const violation = info.prefix > minPrefix ? ' ⚠ below min' : '';
      if (violation) violatesMin = true;
      lines.push(`${(i+1).toString().padStart(3)}. ${s.cidr.padEnd(22)} ${intToIp(info.network)} → ${intToIp(info.broadcast)}  (${info.usable} usable)${violation}`);
    });
    if (result.actualCount > n) {
      lines.push(``);
      lines.push(`Note: ${n} isn't a power of 2. Split into ${result.actualCount} pieces of /${result.newPrefix}, used the first ${n}.`);
      lines.push(`Remaining: ${result.actualCount - n} more /${result.newPrefix} subnets available.`);
    }
    if (violatesMin) {
      lines.push(``);
      lines.push(`⚠ WARNING: Some subnets are smaller than /${minPrefix}, which is below the ${MODES[mode].label} minimum.`);
    }
    showResult('split-result', lines.join('\n'), violatesMin ? 'warn' : 'good');
    showExplain('split-explain',
      `<strong>How:</strong> Splitting into ${n} pieces needs ${result.bitsNeeded} extra bits. /${P.prefix} + ${result.bitsNeeded} = /${result.newPrefix}. ` +
      `Each subnet spans ${result.size.toLocaleString()} addresses.<br><br>` +
      `<strong>Shortcut:</strong> Split into 2 → +1, 4 → +2, 8 → +3, N → +log₂(N).`);
  } catch (e) { showError('split-result', e.message); }
}

function runSize() {
  try {
    const hosts = parseInt(document.getElementById('size-hosts').value, 10);
    const mode = currentMode();
    if (hosts < 1) throw new Error('Need at least 1 host');
    const result = smallestCidrFor(hosts, mode);
    const nextUp = result.prefix > 0 ? result.prefix - 1 : 0;
    const nextUpAddresses = Math.pow(2, 32 - nextUp);
    const nextUpUsable = nextUpAddresses - MODES[mode].reserved;
    const lines = [
      `Need: ${hosts.toLocaleString()} hosts (${MODES[mode].full})`,
      ``,
      `Smallest CIDR: /${result.prefix}`,
      `Total addresses: ${result.addresses.toLocaleString()}`,
      `Usable hosts: ${result.usable.toLocaleString()}`,
    ];
    if (result.hitMin) {
      lines.push(``);
      lines.push(`Note: hit ${MODES[mode].label} minimum of /${MODES[mode].minPrefix}.`);
      lines.push(`You wanted less, but this platform won't allow smaller subnets.`);
    }
    lines.push(``);
    lines.push(`For headroom (2× space):`);
    lines.push(`  /${nextUp} → ${nextUpAddresses.toLocaleString()} total, ${nextUpUsable.toLocaleString()} usable`);
    showResult('size-result', lines.join('\n'), 'good');
    showExplain('size-explain',
      `<strong>How:</strong> Need ${hosts} hosts + ${MODES[mode].reserved} reserved = ${hosts + MODES[mode].reserved} total. ` +
      `Smallest power of 2 that fits is 2<sup>${32-result.prefix}</sup> = ${result.addresses.toLocaleString()}. That's a /${result.prefix}.`);
  } catch (e) { showError('size-result', e.message); }
}

function runMask() {
  try {
    const input = document.getElementById('mask-input').value.trim();
    let prefix, mask;
    if (input.startsWith('/')) {
      prefix = parseInt(input.slice(1), 10);
      if (isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error('Prefix must be 0-32');
      mask = cidrToMask(prefix);
    } else if (input.includes('.')) {
      prefix = maskToCidr(input);
      mask = input;
    } else {
      prefix = parseInt(input, 10);
      if (isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error('Enter either /24 or 255.255.255.0');
      mask = cidrToMask(prefix);
    }
    const maskInt = ipToInt(mask);
    const wildcard = intToIp((~maskInt) >>> 0);
    const total = Math.pow(2, 32 - prefix);
    const lines = [
      `CIDR notation:   /${prefix}`,
      `Subnet mask:     ${mask}`,
      `Wildcard mask:   ${wildcard}`,
      `Total addresses: ${total.toLocaleString()}`,
      ``,
      `Binary mask:`,
      `${toBinaryIp(maskInt)}`,
    ];
    showResult('mask-result', lines.join('\n'), 'good');
    showExplain('mask-explain',
      `<strong>Reading the binary:</strong> ${prefix} ones followed by ${32-prefix} zeros. The 1-bits mark the network portion; the 0-bits mark the host portion.`);
  } catch (e) { showError('mask-result', e.message); }
}

// ============ Builder ============

const DEFAULT_TIERS = [
  { name: 'Public', hosts: 60 },
  { name: 'Private-App', hosts: 250 },
  { name: 'Private-DB', hosts: 30 },
];

let tiers = JSON.parse(JSON.stringify(DEFAULT_TIERS));

function renderTiers() {
  const container = document.getElementById('builder-tiers');
  container.innerHTML = tiers.map((t, i) => `
    <div class="tier-row">
      <div class="input-group">
        <label>Tier name</label>
        <input type="text" value="${t.name}" oninput="tiers[${i}].name = this.value">
      </div>
      <div class="input-group" style="max-width: 160px;">
        <label>Hosts needed</label>
        <input type="number" value="${t.hosts}" min="1" oninput="tiers[${i}].hosts = parseInt(this.value) || 1">
      </div>
      <button class="danger-icon" onclick="removeTier(${i})" title="Remove tier">×</button>
    </div>
  `).join('');
}

function addTier() {
  tiers.push({ name: `Tier-${tiers.length + 1}`, hosts: 50 });
  renderTiers();
}

function removeTier(i) {
  if (tiers.length <= 1) return;
  tiers.splice(i, 1);
  renderTiers();
}

function resetTiers() {
  tiers = JSON.parse(JSON.stringify(DEFAULT_TIERS));
  renderTiers();
}

function runBuilder() {
  try {
    const vpc = document.getElementById('builder-vpc').value;
    const azs = parseInt(document.getElementById('builder-azs').value, 10);
    const mode = currentMode();
    const cfg = MODES[mode];
    if (tiers.length === 0) throw new Error('Add at least one tier');
    const V = parseCidr(vpc);
    const vpcTotal = Math.pow(2, 32 - V.prefix);
    const vpcEnd = (V.network + vpcTotal - 1) >>> 0;

    // Calculate size for each tier
    const specs = tiers.map(t => {
      const total = t.hosts + cfg.reserved;
      let bits = Math.ceil(Math.log2(Math.max(total, 2)));
      let prefix = 32 - bits;
      if (prefix > cfg.minPrefix) {
        prefix = cfg.minPrefix;
        bits = 32 - prefix;
      }
      return {
        name: t.name,
        hostsRequested: t.hosts,
        prefix,
        size: Math.pow(2, 32 - prefix),
      };
    });

    // Allocate largest tiers first to avoid fragmentation
    const sortedSpecs = [...specs].sort((a, b) => a.prefix - b.prefix);
    const allocations = [];
    let cursor = V.network;

    for (const spec of sortedSpecs) {
      for (let az = 1; az <= azs; az++) {
        const remainder = cursor % spec.size;
        if (remainder !== 0) cursor = (cursor + spec.size - remainder) >>> 0;
        if (cursor + spec.size - 1 > vpcEnd) {
          throw new Error(`Not enough space in ${vpc}. Ran out while placing ${spec.name} in AZ ${az}. Try a bigger parent CIDR or reduce host requirements.`);
        }
        allocations.push({
          az,
          tier: spec.name,
          cidr: `${intToIp(cursor)}/${spec.prefix}`,
          network: cursor,
          end: (cursor + spec.size - 1) >>> 0,
          size: spec.size,
          usable: spec.size - cfg.reserved,
          hostsRequested: spec.hostsRequested,
        });
        cursor = (cursor + spec.size) >>> 0;
      }
    }

    allocations.sort((a, b) => a.az - b.az || a.network - b.network);

    const totalUsed = allocations.reduce((sum, a) => sum + a.size, 0);
    const remaining = vpcTotal - totalUsed;

    let out = '';
    out += `Parent CIDR: ${vpc}\n`;
    out += `Total addresses: ${vpcTotal.toLocaleString()}\n`;
    out += `Mode: ${cfg.full} (${cfg.reserved} reserved per subnet, /${cfg.minPrefix} min)\n`;
    out += `AZs: ${azs}   Tiers per AZ: ${tiers.length}   Total subnets: ${allocations.length}\n`;
    out += `${'─'.repeat(95)}\n`;

    let currentAz = 0;
    for (const a of allocations) {
      if (a.az !== currentAz) {
        currentAz = a.az;
        out += `\n── AZ ${currentAz} ──\n`;
      }
      const cidrCol = a.cidr.padEnd(20);
      const tierCol = a.tier.padEnd(14);
      const rangeCol = `${intToIp(a.network)} → ${intToIp(a.end)}`.padEnd(34);
      out += `  ${tierCol} ${cidrCol} ${rangeCol} ${a.usable.toLocaleString()} usable (${a.hostsRequested} req)\n`;
    }

    out += `${'─'.repeat(95)}\n`;
    out += `Used:      ${totalUsed.toLocaleString()} of ${vpcTotal.toLocaleString()} addresses (${((totalUsed/vpcTotal)*100).toFixed(1)}%)\n`;
    out += `Remaining: ${remaining.toLocaleString()} addresses (${((remaining/vpcTotal)*100).toFixed(1)}%)\n`;
    if (remaining > 0 && cursor <= vpcEnd) {
      out += `Free from: ${intToIp(cursor)} onwards\n`;
    }

    let tfOut = '';
    if (mode === 'aws') {
      tfOut += `resource "aws_vpc" "main" {\n  cidr_block = "${vpc}"\n}\n\n`;
      allocations.forEach(a => {
        const name = `${a.tier.toLowerCase().replace(/[^a-z0-9]/g, '_')}_az${a.az}`;
        tfOut += `resource "aws_subnet" "${name}" {\n`;
        tfOut += `  vpc_id            = aws_vpc.main.id\n`;
        tfOut += `  cidr_block        = "${a.cidr}"\n`;
        tfOut += `  availability_zone = "\${var.region}${String.fromCharCode(96 + a.az)}"\n`;
        tfOut += `}\n\n`;
      });
    } else if (mode === 'gcp') {
      tfOut += `resource "google_compute_network" "main" {\n  name                    = "main-vpc"\n  auto_create_subnetworks = false\n}\n\n`;
      allocations.forEach(a => {
        const name = `${a.tier.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${a.az}`;
        tfOut += `resource "google_compute_subnetwork" "${name.replace(/-/g, '_')}" {\n`;
        tfOut += `  name          = "${name}"\n`;
        tfOut += `  network       = google_compute_network.main.id\n`;
        tfOut += `  ip_cidr_range = "${a.cidr}"\n`;
        tfOut += `  region        = var.region\n`;
        tfOut += `}\n\n`;
      });
    } else {
      tfOut += `# Standard / on-prem network plan\n`;
      tfOut += `# Parent network: ${vpc}\n\n`;
      allocations.forEach(a => {
        tfOut += `# ${a.tier} — Zone ${a.az}\n`;
        tfOut += `#   CIDR:  ${a.cidr}\n`;
        tfOut += `#   Range: ${intToIp(a.network)} → ${intToIp(a.end)}\n`;
        tfOut += `#   Usable hosts: ${a.usable}\n\n`;
      });
    }

    showResult('builder-result', out, 'good');
    
    // Show TF Snippet
    document.getElementById('builder-tf-result').textContent = tfOut;
    document.getElementById('builder-tf-container').style.display = 'block';

    showExplain('builder-explain',
      `<strong>How the builder allocates:</strong> Tiers are placed largest-first to avoid fragmentation. ` +
      `Each subnet is aligned to a boundary that's a multiple of its size (a /24 must start at a multiple of 256, a /26 at a multiple of 64). ` +
      `Within each tier, one subnet is created per AZ, then we move to the next tier.<br><br>` +
      `<strong>Platform limits applied:</strong> ${cfg.full} reserves ${cfg.reserved} IPs per subnet and enforces /${cfg.minPrefix} as the smallest allowed subnet. ` +
      `Even if you asked for fewer hosts, the builder rounds up to /${cfg.minPrefix}.<br><br>` +
      `<strong>Design tip:</strong> Leave headroom for future subnets. Using only 50% of your parent CIDR up front is a common pattern. ` +
      `If you plan to peer networks later, use the Overlap tab to check CIDRs don't conflict.`);
  } catch (e) {
    showError('builder-result', e.message);
    document.getElementById('builder-tf-container').style.display = 'none';
  }
}

// ============ Full CIDR reference table ============

function buildFullCidrTable() {
  const uses = {
    0: '"Anywhere" / default route',
    1: 'Half the internet', 2: 'Quarter of internet', 3: '', 4: 'Multicast range',
    5: '', 6: '', 7: '',
    8: 'Entire Class A / private 10.x',
    9: '', 10: 'Carrier-grade NAT', 11: '',
    12: 'Private 172.16.x range',
    13: '', 14: '', 15: '',
    16: 'Class B / whole VPC / 192.168.x',
    17: '', 18: '', 19: '', 20: 'Large subnet',
    21: '', 22: '', 23: 'Two /24s combined',
    24: 'Classic subnet (Class C)',
    25: 'Half a /24',
    26: 'Medium subnet',
    27: 'Small AWS subnet',
    28: 'AWS/Azure minimum',
    29: 'GCP minimum',
    30: 'Point-to-point link (std min)',
    31: 'RFC 3021 P2P (2 hosts)',
    32: 'Single host / firewall rule',
  };

  const tbody = document.querySelector('#full-cidr-table tbody');
  let rows = '';
  for (let p = 0; p <= 32; p++) {
    const total = Math.pow(2, 32 - p);
    const mask = cidrToMask(p);
    let std, gcp, aws;

    if (p === 32) { std = '1'; gcp = '—'; aws = '—'; }
    else if (p === 31) { std = '2'; gcp = '—'; aws = '—'; }
    else if (p === 30) {
      std = (total - 2).toString();
      gcp = '—';
      aws = '—';
    }
    else if (p === 29) {
      std = (total - 2).toString();
      gcp = (total - 4).toString();
      aws = '—';
    }
    else if (p === 28) {
      std = (total - 2).toString();
      gcp = (total - 4).toString();
      aws = (total - 5).toString();
    }
    else {
      std = (total - 2).toLocaleString();
      gcp = (total - 4).toLocaleString();
      aws = (total - 5).toLocaleString();
    }

    const totalStr = total >= 1e6 ? (total / 1e6).toFixed(1) + 'M' : total.toLocaleString();
    rows += `<tr><td>/${p}</td><td>${mask}</td><td>${totalStr}</td><td>${std}</td><td>${gcp}</td><td>${aws}</td><td>${uses[p] || ''}</td></tr>`;
  }
  tbody.innerHTML = rows;
}

// ============ Initialize ============

renderTiers();
buildFullCidrTable();
onModeChange(); // sets badges and runs first inspect

document.querySelectorAll('.section').forEach(sec => {
  sec.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && inp.type !== 'checkbox') {
        const btn = sec.querySelector('button:not(.ghost):not(.secondary):not(.danger-icon)');
        if (btn) btn.click();
      }
    });
  });
});

function copyTfSnippet() {
  const tfText = document.getElementById('builder-tf-result').textContent;
  navigator.clipboard.writeText(tfText).then(() => {
    alert('Terraform snippet copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy text: ', err);
    alert('Failed to copy text to clipboard.');
  });
}

