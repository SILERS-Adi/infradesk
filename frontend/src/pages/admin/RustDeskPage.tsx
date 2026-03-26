export function RustDeskPage() {
  const url = 'http://188.68.236.166:21114/static/index.html';

  return (
    <div className="flex flex-col h-full -m-6">
      <div className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ background: 'rgba(255,255,255,0.035)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="text-lg font-bold text-white/90">Panel RustDesk</h1>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Zdalny pulpit — zarządzanie sesjami</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-violet-400 hover:underline"
        >
          Otwórz w nowej karcie
        </a>
      </div>
      <iframe
        src={url}
        className="flex-1 w-full border-0"
        title="RustDesk Panel"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
