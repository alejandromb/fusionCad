# 3-Wire Motor Starter — Circuit Specification

Reference spec for the `generate_motor_starter` MCP tool / circuit template.

---

## Overview

A standard 3-wire motor starter consists of two sections:

1. **Power section** — 3-phase supply through circuit breaker, contactor main contacts, and overload relay to motor
2. **Control section** — Start/stop pushbuttons, contactor coil, seal-in contact, and pilot light

The power section is drawn as a **schematic** (free-form placement, top-to-bottom power flow).
The control section is drawn as a **ladder diagram** (L1/L2 rails, horizontal rungs).

---

## Sheet 1 — Power (Schematic)

| Tag | Symbol ID | Description | Pins |
|-----|-----------|-------------|------|
| CB1 | `iec-circuit-breaker-3p` | Main circuit breaker | L1,T1,L2,T2,L3,T3 |
| K1  | `iec-contactor-3p` | 3-pole contactor (primary) | L1,T1,L2,T2,L3,T3 |
| F1  | `iec-thermal-overload-relay-3p` | Thermal overload relay (primary) | L1,T1,L2,T2,L3,T3 |
| M1  | `iec-motor-3ph` | 3-phase motor | 1(U1),2(V1),3(W1) |

### Power Wiring (9 wires, 3 per phase)

| Phase | From | Pin | To | Pin |
|-------|------|-----|----|-----|
| L1 | CB1 | T1 | K1 | L1 |
| L1 | K1 | T1 | F1 | L1 |
| L1 | F1 | T1 | M1 | 1 |
| L2 | CB1 | T2 | K1 | L2 |
| L2 | K1 | T2 | F1 | L2 |
| L2 | F1 | T2 | M1 | 2 |
| L3 | CB1 | T3 | K1 | L3 |
| L3 | K1 | T3 | F1 | L3 |
| L3 | F1 | T3 | M1 | 3 |

### Layout

Devices are placed vertically (top-to-bottom power flow):

```
        L1  L2  L3
        |   |   |
      [  CB1  ]        y=60
        |   |   |
      [  K1   ]        y=180
        |   |   |
      [  F1   ]        y=300
        |   |   |
      [  M1   ]        y=420
```

---

## Sheet 2 — Control (Ladder, 120VAC or 24VDC)

| Rung | Devices (L1 → L2) | Description |
|------|--------------------|-------------|
| 1 | F1(NC) → S2(Stop NC) → S1(Start NO) → J1(Junction) → K1(Coil) | Motor start/stop |
| 2 | F1(NC) → K1(Seal-in NO) → J1(Junction) | Seal-in (branch of rung 1) |
| 3 | K1(Aux NO) → PL1(Pilot Light) | Running indicator |

### Control Devices

| Tag | Symbol ID | Linked To | Description |
|-----|-----------|-----------|-------------|
| F1 | `iec-normally-closed-contact` | F1 (power sheet) | OL aux NC contact (rung 1) |
| S2 | `iec-normally-closed-contact` | — | Stop pushbutton |
| S1 | `iec-normally-open-contact` | — | Start pushbutton |
| J1 | `junction` | — | Branch junction |
| K1 | `iec-coil` | K1 (power sheet) | Contactor coil |
| F1 | `iec-normally-closed-contact` | F1 (power sheet) | OL aux NC contact (rung 2) |
| K1 | `iec-normally-open-contact` | K1 (power sheet) | Seal-in contact |
| K1 | `iec-normally-open-contact` | K1 (power sheet) | Aux contact for pilot light |
| PL1 | `iec-pilot-light` | — | Running indicator |

### Control Wiring (7 rung wires + 8 rail wires)

Rung 1: F1.2→S2.1, S2.2→S1.1, S1.2→J1.1, J1.1→K1.1
Rung 2: F1.2→K1.1, K1.2→J1.1 (branch to junction)
Rung 3: K1.2→PL1.1

---

## Linked Device Groups

| Physical Device | Power Sheet | Control Sheet |
|-----------------|-------------|---------------|
| K1 (Contactor) | `iec-contactor-3p` (primary) | `iec-coil` + `iec-normally-open-contact` x2 (linked) |
| F1 (Overload) | `iec-thermal-overload-relay-3p` (primary) | `iec-normally-closed-contact` x2 (linked) |

All linked representations share the same tag and `deviceGroupId`. BOM counts each physical device once.

---

## Template Parameters

| Parameter | Default | Options |
|-----------|---------|---------|
| `controlVoltage` | `120VAC` | `120VAC`, `24VDC` |
| `motorTag` | `M1` | Any valid tag prefix |

When `controlVoltage` is `24VDC`, rail labels change to `+24V` / `0V`.

---

## Device Count Summary

| Section | Devices | Wires |
|---------|---------|-------|
| Power | 4 | 9 |
| Control (rungs) | 9 | 7 |
| Control (rail junctions) | 5 | 8 |
| **Total** | **18** | **24** |
