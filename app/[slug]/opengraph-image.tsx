import { ImageResponse } from "next/og";
import { getStoreBySlug } from "@/lib/db";
import { THEME, initials } from "@/lib/themes";

// WhatsApp and Instagram DMs are where these links get shared, so the
// preview card matters as much as the page.
export const alt = "Creator store";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await getStoreBySlug(slug.toLowerCase()).catch(() => null);
  const t = THEME[s?.theme ?? "sunset"];
  const name = s?.creator.display_name ?? "Creator store";
  const tagline = s?.creator.tagline ?? "Made with Shuru";
  const items = (s?.products ?? []).slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: `linear-gradient(135deg, ${t.from}, ${t.to})`,
          padding: 48,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: t.card,
            color: t.text,
            borderRadius: 36,
            padding: "48px 56px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {s?.creator.avatar ? (
              <img src={s.creator.avatar} width={120} height={120} style={{ borderRadius: 60 }} alt="" />
            ) : (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  background: `linear-gradient(135deg, ${t.from}, ${t.to})`,
                  color: "white",
                  fontSize: 48,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {initials(name)}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1 }}>{name}</div>
              <div style={{ fontSize: 28, color: t.muted, marginTop: 10, lineHeight: 1.3 }}>{tagline.slice(0, 90)}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 40 }}>
            {items.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  fontSize: 28,
                  background: t.chip,
                  color: t.text,
                  borderRadius: 18,
                  padding: "14px 22px",
                }}
              >
                {p.title.slice(0, 60)}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
