import { isSuiteProductLocked } from '@pulse-suite/productLock';

export function CommerceLockedPage() {
  if (!isSuiteProductLocked('commerce')) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500"
          aria-label="Pulse Commerce locked"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Pulse Commerce</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          This product is locked and is not available.
        </p>
        <a
          href="/trips"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-[#4D3636] bg-[#CDE9F7] px-5 text-sm font-semibold text-[#4D3636]"
        >
          Back to trips
        </a>
      </div>
    </div>
  );
}
