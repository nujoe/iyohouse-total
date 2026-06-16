const HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]+/g;

type MixedWorkshopTitleProps = {
  as?: "div" | "h1";
  className?: string;
  title: string;
};

export default function MixedWorkshopTitle({
  as: Tag = "div",
  className,
  title,
}: MixedWorkshopTitleProps) {
  const parts = title.split(HANGUL_PATTERN);
  const matches = title.match(HANGUL_PATTERN) ?? [];

  return (
    <Tag className={className}>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {matches[index] ? (
            <span className="detail-title-hangul">{matches[index]}</span>
          ) : null}
        </span>
      ))}
    </Tag>
  );
}
