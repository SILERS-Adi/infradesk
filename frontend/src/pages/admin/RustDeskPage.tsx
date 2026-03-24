export function RustDeskPage() {
  const url = 'http://188.68.236.166:21114/static/index.html';

  return (
    <div className="flex flex-col h-full -m-6">
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Panel RustDesk</h1>
          <p className="text-xs text-gray-500">Zdalny pulpit — zarządzanie sesjami</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-indigo-600 hover:underline"
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
