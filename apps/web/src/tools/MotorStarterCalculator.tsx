import { useMemo, useState } from 'react';
import {
  lookupMotorStarter,
  listAvailableMotorSpecs,
  type MotorSpec,
  type MotorStarterResult,
  type ComponentSelection,
} from '@fusion-cad/core-model';
import './motor-starter-calculator.css';

type StarterType = NonNullable<MotorSpec['starterType']>;

const STARTER_LABELS: Record<StarterType, string> = {
  'iec-open': 'IEC — Open',
  'iec-enclosed': 'IEC — Enclosed (Type 1)',
  'nema-open': 'NEMA — Open',
  'nema-enclosed': 'NEMA — Enclosed (Type 1)',
};

function buildOptions() {
  const specs = listAvailableMotorSpecs();
  const byCountryPhase = new Map<string, { voltages: Set<string>; hps: Map<string, Set<string>> }>();
  for (const s of specs) {
    const key = `${s.country}::${s.phase}`;
    let entry = byCountryPhase.get(key);
    if (!entry) {
      entry = { voltages: new Set(), hps: new Map() };
      byCountryPhase.set(key, entry);
    }
    entry.voltages.add(s.voltage);
    let hps = entry.hps.get(s.voltage);
    if (!hps) {
      hps = new Set();
      entry.hps.set(s.voltage, hps);
    }
    hps.add(s.hp);
  }
  return byCountryPhase;
}

function sortHp(a: string, b: string): number {
  const toNum = (s: string) => {
    if (s.includes('/')) {
      const [n, d] = s.split('/').map(Number);
      return n / d;
    }
    return parseFloat(s);
  };
  return toNum(a) - toNum(b);
}

function ComponentCard({ label, component }: { label: string; component: ComponentSelection | undefined }) {
  if (!component) return null;
  return (
    <div className="msc-component">
      <div className="msc-component-role">{label}</div>
      <div className="msc-component-part">{component.partNumber}</div>
      <div className="msc-component-desc">{component.description}</div>
      {component.datasheetUrl && (
        <a
          className="msc-component-link"
          href={component.datasheetUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View datasheet →
        </a>
      )}
    </div>
  );
}

/**
 * Encode the calculator spec for the deterministic handoff endpoint.
 * Uses base64url-encoded JSON so it round-trips cleanly through URL params.
 */
function buildHandoffSpec(result: MotorStarterResult): string {
  const s = result.spec;
  const spec = {
    hp: s.hp,
    voltage: s.voltage,
    phase: s.phase || 'three',
    country: s.country || 'USA',
    starterType: s.starterType || 'iec-open',
    controlVoltage: '120VAC',
    hoaSwitch: true,
    pilotLight: true,
    plcRemote: false,
    eStop: true,
  };
  // btoa is safe here — spec is ASCII-only strings and booleans.
  return btoa(JSON.stringify(spec));
}

function ResultPanel({ result }: { result: MotorStarterResult }) {
  const c = result.components;
  const handoffUrl = `/?motorStarter=${encodeURIComponent(buildHandoffSpec(result))}`;
  return (
    <div className="msc-result-panel">
      <div className="msc-result-summary">
        <div className="msc-stat">
          <div className="msc-stat-label">Full Load Amps</div>
          <div className="msc-stat-value">{result.motorFLA} A</div>
        </div>
        <div className="msc-stat">
          <div className="msc-stat-label">Wire Size</div>
          <div className="msc-stat-value">#{result.wireSize}</div>
        </div>
        <div className="msc-stat">
          <div className="msc-stat-label">Breaker</div>
          <div className="msc-stat-value">{result.breakerSize} A</div>
        </div>
        {result.safetySwitchSize !== '-' && (
          <div className="msc-stat">
            <div className="msc-stat-label">Safety Switch</div>
            <div className="msc-stat-value">{result.safetySwitchSize} A</div>
          </div>
        )}
      </div>

      <div className="msc-components">
        <ComponentCard label="Circuit Breaker" component={c.circuitBreaker} />
        <ComponentCard label="Contactor" component={c.contactor} />
        <ComponentCard label="Overload Relay" component={c.overloadRelay} />
        {c.disconnectSwitch && <ComponentCard label="Disconnect Switch" component={c.disconnectSwitch} />}
        {c.manualStarter && <ComponentCard label="Manual Starter" component={c.manualStarter} />}
        {c.starterKit && <ComponentCard label="Starter Kit" component={c.starterKit} />}
      </div>

      <div className="msc-cta-wrap">
        <a href={handoffUrl} className="msc-cta-primary">
          Draw this circuit in fusionCad →
        </a>
        <p className="msc-cta-hint">Deterministic — same spec, same circuit · Free · Export to PDF</p>
      </div>
    </div>
  );
}

export function MotorStarterCalculator() {
  const options = useMemo(() => buildOptions(), []);

  const [country, setCountry] = useState<MotorSpec['country']>('USA');
  const [phase, setPhase] = useState<MotorSpec['phase']>('three');
  const key = `${country}::${phase}`;
  const available = options.get(key);

  const voltages = useMemo(
    () => (available ? Array.from(available.voltages).sort((a, b) => parseInt(a) - parseInt(b)) : []),
    [available],
  );

  const [voltage, setVoltage] = useState<string>(voltages[0] || '480V');
  const hpOptions = useMemo(() => {
    const hps = available?.hps.get(voltage);
    return hps ? Array.from(hps).sort(sortHp) : [];
  }, [available, voltage]);

  const [hp, setHp] = useState<string>(hpOptions[0] || '1');
  const [starterType, setStarterType] = useState<StarterType>('iec-open');

  // Keep voltage/hp synced when country/phase change
  const safeVoltage = voltages.includes(voltage) ? voltage : voltages[0] || '';
  const safeHp = hpOptions.includes(hp) ? hp : hpOptions[0] || '';

  const result = useMemo(() => {
    if (!safeVoltage || !safeHp) return null;
    return lookupMotorStarter({
      hp: safeHp,
      voltage: safeVoltage,
      country,
      phase,
      starterType,
    });
  }, [safeHp, safeVoltage, country, phase, starterType]);

  const validStarterTypes: StarterType[] = phase === 'single'
    ? ['nema-open', 'nema-enclosed']
    : ['iec-open', 'iec-enclosed', 'nema-open', 'nema-enclosed'];

  const safeStarterType = validStarterTypes.includes(starterType) ? starterType : validStarterTypes[0];

  return (
    <div className="msc-page">
      <header className="msc-header">
        <div className="msc-brand">
          <span className="msc-brand-mark">⚡</span>
          <span className="msc-brand-name">fusionCad</span>
          <span className="msc-brand-by">by fusionLogik</span>
        </div>
        <nav className="msc-nav">
          <a href="/">Open the editor →</a>
        </nav>
      </header>

      <section className="msc-hero">
        <h1 className="msc-h1">Motor Starter Calculator</h1>
        <p className="msc-lede">
          Pick the right contactor, overload relay, and breaker in seconds. Built on 216 verified Schneider Electric configurations.
        </p>
      </section>

      <main className="msc-main">
        <section className="msc-form-card">
          <div className="msc-form-grid">
            <div className="msc-field">
              <label className="msc-label">Country</label>
              <select className="msc-select" value={country} onChange={e => setCountry(e.target.value as MotorSpec['country'])}>
                <option value="USA">United States</option>
                <option value="Canada">Canada</option>
              </select>
            </div>
            <div className="msc-field">
              <label className="msc-label">Phase</label>
              <select className="msc-select" value={phase} onChange={e => setPhase(e.target.value as MotorSpec['phase'])}>
                <option value="three">Three-phase</option>
                <option value="single">Single-phase</option>
              </select>
            </div>
            <div className="msc-field">
              <label className="msc-label">Voltage</label>
              <select className="msc-select" value={safeVoltage} onChange={e => setVoltage(e.target.value)}>
                {voltages.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="msc-field">
              <label className="msc-label">Motor HP</label>
              <select className="msc-select" value={safeHp} onChange={e => setHp(e.target.value)}>
                {hpOptions.map(h => <option key={h} value={h}>{h} HP</option>)}
              </select>
            </div>
            <div className="msc-field msc-field-wide">
              <label className="msc-label">Starter Type</label>
              <select
                className="msc-select"
                value={safeStarterType}
                onChange={e => setStarterType(e.target.value as StarterType)}
              >
                {validStarterTypes.map(s => (
                  <option key={s} value={s}>{STARTER_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {result ? (
          <ResultPanel result={result} />
        ) : (
          <section className="msc-empty">
            <p>No starter configuration found for this combination.</p>
            <p className="msc-empty-hint">
              {phase === 'single'
                ? 'Single-phase motors use NEMA starters only.'
                : 'Try a different voltage or HP.'}
            </p>
          </section>
        )}

        <section className="msc-footer-pitch">
          <div>
            <h2>From calculation to schematic</h2>
            <p>
              fusionCad generates a full motor starter schematic from this spec — power wiring, control circuits,
              PLC I/O, terminals, and BOM — ready to export as PDF.
            </p>
            <a className="msc-cta-secondary" href="/">Open fusionCad →</a>
          </div>
        </section>
      </main>

      <footer className="msc-footer">
        <p>Data: Schneider Electric motor data catalog. This calculator is a guide — always verify with manufacturer specs and local code.</p>
        <p className="msc-footer-legal">© {new Date().getFullYear()} fusionLogik. fusionCad and the Motor Starter Calculator are products of fusionLogik.</p>
      </footer>
    </div>
  );
}
