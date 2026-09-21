"use client";
import { AccountSettings, validAccount } from "@/lib/sizing";
export function AccountControls({
  account,
  onChange,
}: {
  account: AccountSettings;
  onChange: (value: AccountSettings) => void;
}) {
  return (
    <section
      className="panel account-controls"
      aria-label="Account risk settings"
    >
      <div>
        <div className="eyebrow">YOUR PLANNING BUDGET</div>
        <h2>Account risk</h2>
        <p>
          Reference equity, not a connected wallet balance. Saved on this
          device.
        </p>
      </div>
      <label className="form-field">
        <span>Reference equity · USD</span>
        <input
          aria-label="Desk reference equity"
          type="number"
          min="1"
          step="any"
          value={Number.isFinite(account.equity) ? account.equity : ""}
          onChange={(e) =>
            onChange({
              ...account,
              equity: e.target.value === "" ? NaN : Number(e.target.value),
            })
          }
        />
      </label>
      <label className="form-field">
        <span>Risk per setup · %</span>
        <input
          aria-label="Desk risk percent"
          type="number"
          min="0.01"
          max="1"
          step="0.05"
          value={
            Number.isFinite(account.riskPercent) ? account.riskPercent : ""
          }
          onChange={(e) =>
            onChange({
              ...account,
              riskPercent: e.target.value === "" ? NaN : Number(e.target.value),
            })
          }
        />
      </label>
      <div role="status">
        <strong>
          {validAccount(account)
            ? `$${((account.equity * account.riskPercent) / 100).toFixed(2)}`
            : "Invalid settings"}
        </strong>
        <p>
          Planned loss budget per setup · includes modeled costs · 1× notional
          cap
        </p>
      </div>
    </section>
  );
}
