# Incoming parts

Parts and tools we've discussed for Ampage but not built yet, roughly in the
order they'd be most useful. Move an entry out when it's done.

## Signals

- **Neon indicator**: glows only above ~90 V, with strike/extinguish
  hysteresis; the classic mains "on" light.
- **Flashing beacon**: a lamp with a built-in flasher that blinks whenever
  powered.
- **Multi-digit 7-segment display** (4 digits, multiplexed): pairs with a
  counter or shift register.
- **AC door chime**: two-tone ding-dong on an AC supply (the bell's sibling).

## Chips

- **L293D** (dual H-bridge): forward/reverse a DC motor from logic.
- **CD4026** (decade counter with 7-segment driver): one chip, a counting
  display.
- **74HC595** (8-bit shift register): serial to parallel; drives LEDs and the
  bar graph.
- **LM317** (adjustable regulator): output set by two resistors.
- **PC817** (optocoupler): isolated signals; needed for a switch-mode charger.
- **TL431** (adjustable shunt reference): precise regulation, SMPS feedback.
- **PWM controller** (UC3842-style): for a switch-mode supply.
- **LM386** (audio amplifier): drives the speaker from small signals.

## Loads

- **Solenoid valve**: the solenoid model with a valve symbol.
- **Fan**: a motor preset with a fan symbol and load curve.
- **Stepper motor**: steps per coil pulse; pairs with counters and flip-flops.
- **Servo**: angle from a PWM signal.
- **Socket outlet**: endpoint of a house-wiring circuit, with a chosen
  appliance as its load.
- **Phone / USB load**: a Li-ion battery that charges, with a charge gauge.

## Switching and protection

- **Reversing contactor**: two interlocked 3-pole contactors, the second
  swapping two phases.
- **MCB circuit breaker**: resettable, with a trip curve.
- **RCD**: trips on current leaking to earth.
- **Thermal overload relay**: protects a motor; with a contactor makes a
  motor starter.

## Tools (Tools menu)

- **Logic analyzer**: 8 digital channels as a timing diagram.
- **Spectrum analyzer**: FFT of a probe's signal (ripple, harmonics, tones).
- **Data logger**: slow quantities over minutes (charge, temperature, speed).
- **Power meter**: power in and out, and efficiency.
- **Node voltages table**: every net's voltage in one list.
- **Circuit checker**: floating pins, no ground, shorts, overloads, polarity.
- **Parts list (BOM)** as its own tool, with export.
- **Panel tabs**: once there's a second bottom-panel tool, share the bottom
  sheet with M3 tabs.

## Projects

- **Switch-mode phone charger**: mains → bridge → MOSFET + flyback
  transformer → 5 V, with optocoupler/TL431 feedback.
- **Smooth 5 V without a 7805**: regulate with discrete parts or an op-amp.
