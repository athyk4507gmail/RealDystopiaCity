import DataSourceBadge from "./DataSourceBadge";

interface LiveSourceBannerProps {
  source: string;
  sourceType: "live" | "reported" | "estimated" | "cached";
  stale?: boolean;
  cached?: boolean;
}

export default function LiveSourceBanner({
  source,
  sourceType,
  stale,
  cached,
}: LiveSourceBannerProps) {
  const detail = [
    source,
    cached ? "cached" : null,
    stale ? "stale fallback" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const badgeType =
    sourceType === "cached" ? "estimated" : sourceType === "reported" ? "reported" : sourceType;

  return <DataSourceBadge type={badgeType} detail={detail} />;
}
