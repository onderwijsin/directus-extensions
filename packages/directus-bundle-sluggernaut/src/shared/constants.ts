export const locales = [
	{ label: "Bulgarian", value: "bg" },
	{ label: "German", value: "de" },
	{ label: "Spanish", value: "es" },
	{ label: "French", value: "fr" },
	{ label: "Portuguese", value: "pt" },
	{ label: "Ukranian", value: "uk" },
	{ label: "Vietnamese", value: "vi" },
	{ label: "Danish", value: "da" },
	{ label: "Norwegian", value: "nb" },
	{ label: "Italian", value: "it" },
	{ label: "Dutch", value: "nl" },
	{ label: "Swedish", value: "sv" },
	{ label: "English", value: "en" }
] as const;

export const translations = {
	slug: {
		bg: "Плъзгачът ще бъде генериран автоматично",
		de: "Slug wird automatisch generiert",
		es: "El slug se generará automáticamente",
		fr: "Le slug sera généré automatiquement",
		pt: "O slug será gerado automaticamente",
		uk: "Слаг буде автоматично згенеровано",
		vi: "Slug sẽ được tạo tự động",
		da: "Slug vil blive genereret automatisk",
		nb: "Slug vil bli automatisk generert",
		it: "Il slug verrà generato automaticamente",
		nl: "De slug wordt automatisch gegenereerd",
		sv: "Slug kommer att genereras automatiskt",
		en: "Slug will be auto generated"
	},
	path: {
		bg: "Пътят ще бъде генериран автоматично",
		de: "Pfad wird automatisch generiert",
		es: "La ruta se generará automáticamente",
		fr: "Le chemin sera généré automatiquement",
		pt: "O caminho será gerado automaticamente",
		uk: "Шлях буде згенеровано автоматично",
		vi: "Đường dẫn sẽ được tạo tự động",
		da: "Stien vil blive genereret automatisk",
		nb: "Banen vil bli generert automatisk",
		it: "Il percorso verrà generato automaticamente",
		nl: "Pad wordt automatisch gegenereerd",
		sv: "Sökvägen kommer att genereras automatiskt",
		en: "Path will be auto generated"
	}
};
