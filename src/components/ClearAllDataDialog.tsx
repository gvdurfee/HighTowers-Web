import { useState } from 'react'

export function ClearAllDataDialog(props: {
  missionCount: number
  teamPlanCount: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')
  const ready = typed === 'CLEAR'
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-all-data-title"
        className="bg-white rounded-xl p-6 max-w-lg shadow-lg"
      >
        <h2 id="clear-all-data-title" className="text-xl font-bold text-gray-900 mb-3">
          Clear All Data
        </h2>
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>This erases HighTowers data on this computer only. Other crew computers are not affected.</p>
          <p>
            Air Force report PDFs, updated content-pack ZIPs, and .fpl files already downloaded are kept. Anything
            not already downloaded will be lost. Confirm those files are saved before continuing.
          </p>
          <p>
            This will erase {props.missionCount} {props.missionCount === 1 ? 'mission' : 'missions'} and{' '}
            {props.teamPlanCount} {props.teamPlanCount === 1 ? 'team plan' : 'team plans'}.
          </p>
          <label className="block">
            Type CLEAR to continue
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-gray-900"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="px-3 py-2 text-sm rounded border border-gray-300" onClick={props.onCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            className="px-3 py-2 text-sm rounded bg-cap-pimento text-white disabled:opacity-40"
            onClick={props.onConfirm}
          >
            Clear All Data
          </button>
        </div>
      </div>
    </div>
  )
}
