import { ImageResponse } from "next/og";

export const alt = "Lotto Stats — Thai Lottery Statistics";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const balls = ["7", "5", "1", "4", "9", "5"];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 30% 22%, #2a2418, #14110c 72%)",
          fontFamily: "sans-serif",
          color: "#f5efe0",
        }}
      >
        <div style={{ fontSize: 100, fontWeight: 800, letterSpacing: -2, color: "#e3b341", display: "flex" }}>
          LOTTO STATS
        </div>
        <div style={{ fontSize: 30, color: "#b8b09c", marginTop: 6, display: "flex" }}>
          Thai Lottery Statistics · lotto.ih8people.xyz
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 54 }}>
          {balls.map((b, i) => (
            <div
              key={i}
              style={{
                width: 108,
                height: 108,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 56,
                fontWeight: 800,
                color: "#241f14",
                background:
                  "radial-gradient(circle at 38% 30%, #f7e6a8, #e3b341 55%, #a9721f)",
                boxShadow: "0 10px 30px rgba(227,179,65,0.35)",
              }}
            >
              {b}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
