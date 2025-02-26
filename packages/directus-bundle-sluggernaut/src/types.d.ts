type SlugUpdateEvent = {
    oldValues: string[] // When multiple items are edited together, this will contain the old values of the slug
    newValue: string
    collection: string
}

type SlugDeleteEvent = {
    slugs: string[]
    collection: string
}

type Redirect = {
    id: string;
    user_created?: string;
    date_created?: string;
    user_updated?: string;
    date_updated?: string;
    origin: string;
    destination: string;
    type: 301 | 302;
    is_active: boolean;
    start_date?: string;
    end_date?: string;
}

type RedirectCreate = Omit<Redirect, "id" | "user_created" | "date_created" | "user_updated" | "date_updated">;

type RedirectSettings = {
    use_namespace: boolean;
    use_trailing_slash: boolean;
    namespace: string | null;
}