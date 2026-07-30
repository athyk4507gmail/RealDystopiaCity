export default function RainwaterWidget() {
  return (
    <div id="rw-widget">
      <div className="rw-stage">
        <div className="rw-panel" />

        <div className="rw-cloud rw-cloud--a">
          <svg viewBox="0 0 100 60" aria-hidden="true">
            <path
              d="M20 45 Q5 45 5 32 Q5 20 18 20 Q20 8 35 8 Q50 8 52 20 Q65 20 65 32 Q65 45 50 45 Z"
              fill="#bfe0f5"
              stroke="#7fb8de"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div className="rw-cloud rw-cloud--b">
          <svg viewBox="0 0 100 60" aria-hidden="true">
            <path
              d="M20 45 Q5 45 5 32 Q5 20 18 20 Q20 8 35 8 Q50 8 52 20 Q65 20 65 32 Q65 45 50 45 Z"
              fill="#cfe9f8"
              stroke="#8fc4e6"
              strokeWidth="2"
            />
          </svg>
        </div>

        <div className="rw-rain">
          <div className="rw-drop" />
          <div className="rw-drop" />
          <div className="rw-drop" />
          <div className="rw-drop" />
          <div className="rw-drop" />
        </div>

        <div className="rw-funnel">
          <svg viewBox="0 0 52 40" aria-hidden="true">
            <path d="M2 4 L50 4 L32 30 L20 30 Z" fill="#e8eef2" stroke="#9fb0ba" strokeWidth="2" />
            <path d="M8 4 L44 4 L26 12 Z" fill="#4fa8dd" opacity="0.85" />
          </svg>
        </div>

        <div className="rw-pipe" />
        <div className="rw-pipe-water">
          <span />
        </div>

        <div className="rw-tank">
          <div className="rw-tank-water" />
        </div>

        <div className="rw-uses">
          <div className="rw-use" title="Garden">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 22c0-6 0-10 0-14" stroke="#3f8f52" strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M12 14c-4 0-6-3-6-6 3 0 6 2 6 6z" fill="#5cb86e" />
              <path d="M12 12c4 0 6-3 6-6-3 0-6 2-6 6z" fill="#3f8f52" />
            </svg>
          </div>
          <div className="rw-use" title="Household use">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" fill="#4fa8dd" />
            </svg>
          </div>
          <div className="rw-use" title="Pool / outdoor">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="14" width="18" height="7" rx="1.5" fill="#7cc4ea" />
              <path d="M3 14q2-2 4 0t4 0 4 0 4 0" stroke="#2f8fc7" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
