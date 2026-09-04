# HORACO ZX-SG4T2 (SWTG024AS-A-V2.0.1, 4C + 2SFP)

This device is highly similar to SWTG024AS-V2.0, with different GPIO and port
mapping for its two SFP+ slots. Use the
`MACHINE=PCB_SWTG024AS_A_2_0_1` build target. Do not select the similarly named
5C + 1SFP target for this 4-RJ45 + 2-SFP+ model.

## Brands
|Brand|Type|Managed|PCB|Flash|Chip RTL|
|---|---|---|---|---|---|
| Horaco | ZX-SG4T2 | No | PCB-V2.0.1_19650 | P25D40SH (512 KiB) | RTL8372 |

### Label specifications

- **Name**: HORACO ZX-SG4T2
- **Ports**:
  - 4 × RJ45: 10/100/1000/2500 Mbps
  - 2 × SFP+: 1000 / 2500 / 10000 Mbps

<img src="photos/SWTG024AS-A-V2_0_1_19650/horaco-zx-sg4t2-label.jpg" width="300" />

### What works

The following has been verified on physical hardware:

- The selected machine target exposes four RJ45 ports and two SFP+ slots
- RJ45 port 1 links at 1 Gbps and passes traffic without reported errors
- An FS `SFP-10G-T` module is detected and its host side is configured at 10G
- The web interface, management addressing, VLAN configuration and persistent
  startup configuration work
- LACP can be applied to RJ45 ports 1 and 2, saved persistently to flash, and
  survives reboot

The board does not expose loss-of-signal inputs for the SFP+ slots, so module
detection alone cannot confirm the state of the module's external cable. Other
copper speeds, every physical port and the second SFP+ slot were not exercised
in this test. LACP partner negotiation has not yet been verified on this board.
Because the onboard SPI flash is 512 KiB (`P25D40SH`), web-based dual-bank
firmware upload (`/upload`) is unsupported (which requires >= 1 MiB flash to stage
the update image); updating the firmware image on this hardware requires an
external SPI programmer. Configuration updates via `/config` work normally.


### PCB overview

**Board markings**
- Top silkscreen: `PCB-V2.0.1_19650`

Top side

<img src="photos/SWTG024AS-A-V2_0_1_19650/horaco-zx-sg4t2-pcb-top.jpg" width="300" />

Bottom

<img src="photos/SWTG024AS-A-V2_0_1_19650/horaco-zx-sg4t2-pcb-bottom.jpg" width="300" />

### J1, serial console

| `J1` pin | Signal      |
| -------- | ----------- |
| 1        | 3V3         |
| 2        | GND         |
| 3        | RX (Input)  |
| 4        | TX (Output) |
