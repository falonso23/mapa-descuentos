export function CountPill({ merchants, pins }: { merchants: number; pins: number }) {
  return (
    <div className="count-pill">
      {merchants} comercio{merchants !== 1 ? 's' : ''} · {pins} punto{pins !== 1 ? 's' : ''}
    </div>
  );
}
