import Link from "next/link";

const NAV_LINKS = [
  { href: "/vault",    label: "// Vault"    },
  { href: "/device",   label: "// Device"   },
  { href: "/settings", label: "// Settings" },
  { href: "/faq",      label: "// FAQ"      },
];

interface PageNavProps {
  subtitle: string;
}

export default function PageNav({ subtitle }: PageNavProps) {
  return (
    <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 flex-shrink-0">
      <Link
        href="/"
        className="text-green-500 font-bold text-3xl font-mono hover:text-green-400 transition-colors leading-none"
      >
        N*
      </Link>

      <div className="text-center">
        <div className="inline-block bg-zinc-900 border border-zinc-700 rounded px-5 py-2">
          <p className="text-zinc-100 font-mono text-sm tracking-widest uppercase">NorthStar Companion</p>
          <p className="text-green-500/70 font-mono text-xs tracking-wider mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="text-zinc-500 hover:text-zinc-300 font-mono text-xs transition-colors"
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
