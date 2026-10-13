import { useEffect, useState } from "react";
import { Leaf, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyTheme, readTheme, saveTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const options = [
  { value: "white", label: "Branco", icon: Sun },
  { value: "black", label: "Preto", icon: Moon },
  { value: "emerald", label: "Esmeralda", icon: Leaf },
] as const;

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("white");

  useEffect(() => {
    const restore = () => {
      const saved = readTheme();
      applyTheme(saved);
      setTheme(saved);
    };
    restore();
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) restore();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return (
    <div className="theme-switcher" role="group" aria-label="Tema da interface">
      {options.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant="theme"
          size="sm"
          aria-label={`Tema ${label}`}
          aria-pressed={theme === value}
          title={`Tema ${label}`}
          onClick={() => { saveTheme(value); setTheme(value); }}
        >
          <Icon />
          <span>{label}</span>
        </Button>
      ))}
    </div>
  );
}