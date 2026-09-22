const logoUrl = new URL("../assets/lodex-logo.png", import.meta.url).href;

export function LodexLogo({ className, alt = "" }: { className: string; alt?: string }) {
  return <img className={`lodex-logo ${className}`} src={logoUrl} alt={alt} draggable={false} />;
}
