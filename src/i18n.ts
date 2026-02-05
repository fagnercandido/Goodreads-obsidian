import { moment } from "obsidian";
import en from "./lang/en.json";
import pt from "./lang/pt.json";
import es from "./lang/es.json";
import fr from "./lang/fr.json";
import it from "./lang/it.json";
import ru from "./lang/ru.json";

const localeMap: { [k: string]: Partial<typeof en> } = {
    en,
    pt,
    es,
    fr,
    it,
    ru
};

const locale = localeMap[moment.locale()];

export function t(str: keyof typeof en, variables?: { [key: string]: string | number }): string {
    if (!locale || !locale[str]) {
        return en[str] || str;
    }

    let translation = locale[str] as string;

    if (variables) {
        Object.keys(variables).forEach((key) => {
            translation = translation.replace(`{{${key}}}`, String(variables[key]));
        });
    }

    return translation;
}
