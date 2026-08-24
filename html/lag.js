var lagInterval = Number();
var lagHwMembers = [0, 0, 0, 0];

function lagGroupNumber(index) { return index + 1; }
function lagCommand(index, lacpMode, ports) {
  return "lag " + lagGroupNumber(index) + (lacpMode ? " lacp" : "")
    + (ports.length ? " " + ports.join(" ") : "");
}
function lagOffCommand(index) { return "lag " + lagGroupNumber(index) + " lacp off"; }
function lagHashCommand(index, preset) {
  return "laghash " + lagGroupNumber(index) + " " + preset.kw;
}

// Trunk load-balancing hash presets. `bits` matches the LAG_HASH_* register
// value (see rtl837x_regs.h); `kw` are the "laghash" CLI keywords. A hardware
// value not matching any preset is shown as a read-only "Custom" entry.
const HASH_PRESETS = [
  { label: "L2+L3+L4  (MAC + IP + Port)", bits: 0x7e, kw: "smac dmac sip dip sport dport" },
  { label: "L2  (Src+Dst MAC)",           bits: 0x06, kw: "smac dmac" },
  { label: "L3  (Src+Dst IP)",            bits: 0x18, kw: "sip dip" },
  { label: "L4  (Src+Dst TCP/UDP port)",  bits: 0x60, kw: "sport dport" },
  { label: "L2+L3  (MAC + IP)",           bits: 0x1e, kw: "smac dmac sip dip" },
  { label: "L3+L4  (IP + Port)",          bits: 0x78, kw: "sip dip sport dport" },
  { label: "Ingress port number",         bits: 0x01, kw: "spa" },
];

// Per-LAG "user is editing" flag. While set, the periodic refresh must NOT
// overwrite this LAG's controls (mode dropdown, port checkboxes, hash, status)
// - otherwise a mode change or port selection is silently reverted within 2 s.
// Cleared by Update (lagSub), after which the refresh shows the switch truth.
var lagDirty = [false, false, false, false];

// The LAG section reacts to the mode dropdown IMMEDIATELY (not only after
// Update): in Static mode nothing LACP-related is shown for this LAG, in LACP
// mode the status line explains what will happen on Update.
function modeChanged(l) {
  lagDirty[l] = true;
  const stat = document.getElementById("lagStat" + l);
  if (document.getElementById("mode" + l).value === "lacp")
    stat.textContent = "LACP: select candidate ports and press Update to start negotiation";
  else
    stat.textContent = "";
}

function lagForm() {
  if (!numPorts)
    return;
  for (let j=0; j < 4; j++) {
    var lag = "mLAG" + j
    console.log("Adding LAG " + lag)
    var m = document.getElementById(lag);
    for (let i = 1; i <= numPorts; i++) {
      const d = document.createElement("div");
      d.classList.add("cbgroup");
      const l = document.createElement("label");
      l.innerHTML = "" + i;
      l.classList.add("cbgroup");
      const inp = document.createElement("input");
      inp.type = "checkbox"; inp.setAttribute("class","psel");
      inp.id = "p_" + lag + "_" + i;
      inp.addEventListener("change", () => { lagDirty[j] = true; });
      const o = document.createElement("img");
      if (pIsSFP[i - 1]) {
        o.src = "sfp.svg"; o.width ="60"; o.height ="60";
      } else {
        o.src = "port.svg"; o.width = "40"; o.height = "40";
      }
      l.appendChild(inp); l.appendChild(o);
      d.appendChild(l)
      m.appendChild(d);
    }
    // Per-LAG hash preset dropdown (id: hsel<lag>)
    const sel = document.getElementById("hsel" + j);
    for (let k = 0; k < HASH_PRESETS.length; k++) {
      const o = document.createElement("option");
      o.value = k; o.textContent = HASH_PRESETS[k].label;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => { lagDirty[j] = true; });
    document.getElementById("mode" + j)
      .addEventListener("change", () => modeChanged(j));
  }
  fetchLag();
}

function setL(p, c){
  console.log("LAG setting: ", p, " to ", c);
  document.getElementById(p).checked=c;
}

// Candidate-port mask per LACP-mode LAG (0 = LAG is static), from /lacp.json.
// For a LACP LAG the checkboxes show the *candidate* ports (admin config), not
// the live trunk members - those converge over time and are shown in lagStatN.
var lacpCfg = [0, 0, 0, 0];

function logicalPortBit(physicalPort) {
  let logical = physicalPort - 1;
  if (numPorts < 9)
    logical = physToLogPort[logical];
  return 1 << logical;
}

function updatePortConflicts() {
  if (!numPorts) return;
  for (let l = 0; l < 4; l++) {
    for (let p = 1; p <= numPorts; p++) {
      const input = document.getElementById("p_mLAG" + l + "_" + p);
      if (!input) continue;
      const bit = logicalPortBit(p);
      let owner = 0;
      for (let other = 0; other < 4; other++) {
        if (other === l) continue;
        const members = lacpCfg[other] || lagHwMembers[other];
        if (members & bit) owner = other + 1;
      }
      input.disabled = owner !== 0;
      input.title = owner ? ("Port is already assigned to LAG " + owner) : "";
    }
  }
}

function fetchLag() {
  var xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      const s = JSON.parse(xhttp.responseText);
      console.log("LAG: ", JSON.stringify(s));
      for (let l = 0; l < 4; l++) {
        if (lagDirty[l])          // user is editing this LAG - do not revert
          continue;
        // LACP-managed LAG: checkboxes reflect lacpCfg (set by fetchLacp)
        lagHwMembers[l] = parseInt(s[l].members, 2);
        let members = lacpCfg[l] ? lacpCfg[l] : lagHwMembers[l];
        let hash = parseInt(s[l].hash, 16);
        for (let i = 1; i <= numPorts; i++) {
          let p = i - 1;
          if (numPorts < 9)
            p = physToLogPort[p];
          setL("p_mLAG"+l+"_"+i, members & (1<<p));
        }
        // reflect the trunk's current load-balancing hash as a preset
        const sel = document.getElementById("hsel" + l);
        let idx = HASH_PRESETS.findIndex(p => p.bits === hash);
        // drop any stale "Custom" option from a previous refresh
        const custom = sel.querySelector('option[data-custom]');
        if (custom) sel.removeChild(custom);
        if (idx < 0) {                       // hardware value has no named preset
          const o = document.createElement("option");
          o.value = "c"; o.textContent = "Custom (0x" + hash.toString(16) + ")";
          o.setAttribute("data-custom", "1");
          sel.appendChild(o);
          o.selected = true;
        } else {
          sel.value = idx;
        }
      }
      updatePortConflicts();
    }
  };
  xhttp.open("GET", `/lag.json`, true);
  sendXHTTP(xhttp);
}
async function lagSub(l) {
  const lacpMode = document.getElementById("mode" + l).value === "lacp";
  const ports = [];
  const speeds = [];
  for (let i = 1; i <= numPorts; i++) {
    if (document.getElementById("p_mLAG"+l+"_"+i).checked) {
      ports.push(i);
      const logical = numPorts < 9 ? physToLogPort[i - 1] : i - 1;
      if (pState[logical] > 0) speeds.push(pState[logical]);
    }
  }
  if (lacpMode && !ports.length) {
    alert("Select at least one candidate port, or switch the group to Static to remove it.");
    return;
  }
  if (lacpMode && new Set(speeds).size > 1) {
    alert("Active LACP links must negotiate the same speed.");
    return;
  }
  const cmd = lagCommand(l, lacpMode, ports);
  if (!lacpMode && lacpCfg[l])
    // switched from LACP to Static: release it from LACP first; the static
    // member set (possibly empty) is programmed right after.
    await fetch('/cmd', { method: 'POST', body: lagOffCommand(l) })
      .catch(err => console.error(`Error: ${err}`));
  try {
    await fetch('/cmd', { method: 'POST', body: cmd });
    // Apply the load-balancing hash from the dropdown (skip a "Custom" entry -
    // it just reflects an out-of-band value and has no keywords to send).
    const sel = document.getElementById("hsel" + l);
    if (sel.value !== "c") {
      const hcmd = lagHashCommand(l, HASH_PRESETS[Number(sel.value)]);
      await fetch('/cmd', { method: 'POST', body: hcmd });
      console.log('Completed!', cmd, '/', hcmd);
    } else {
      console.log('Completed!', cmd, '(hash unchanged)');
    }
  } catch(err) {
    console.error(`Error: ${err}`);
  }
  // Editing is done - let the periodic refresh show the switch's truth again.
  lagDirty[l] = false;
  fetchLacp();
}

function fetchLacp() {
  var xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      const s = JSON.parse(xhttp.responseText);
      // textContent throughout: agg/psys carry bytes taken from received
      // LACPDUs (remote-controlled), never render them as HTML
      for (let l = 0; l < 4; l++) {
        const lg = s.lags[l];
        lacpCfg[l] = parseInt(lg.cfg, 16);
        if (lagDirty[l])          // user is editing this LAG - do not revert
          continue;
        document.getElementById("mode" + l).value = lacpCfg[l] ? "lacp" : "static";
        document.getElementById("lagStat" + l).textContent = lacpCfg[l]
          ? ("LACP: aggregator " + (lg.aggValid ? lg.agg : "(negotiating)")
             + " — active members: 0x" + lg.members)
          : "";
      }
      let t = "";
      if (s.on) {
        t = "port  lag   link-class  actor  partner  rxstate  rx-count  partner-system\n";
        for (const p of s.ports) {
          if (p.lag == 255) continue;     // not part of any LACP LAG
          t += String(p.p).padEnd(6) + String(p.lag + 1).padEnd(6) + String(p.oc).padEnd(12)
             + p.a.padEnd(7) + p.pt.padEnd(9)
             + String(p.rs).padEnd(9) + String(parseInt(p.rx, 16)).padEnd(10) + p.psys + "\n";
        }
      }
      document.getElementById("lacpPorts").textContent = t;
      updatePortConflicts();
      fetchLag();
    }
  };
  xhttp.open("GET", `/lacp.json`, true);
  sendXHTTP(xhttp);
}

window.addEventListener("load", function() {
  update( () => {
    lagForm();
    fetchLacp();
    const interval = setInterval(update, 2000);
    setInterval(fetchLacp, 2000);
  });
});
