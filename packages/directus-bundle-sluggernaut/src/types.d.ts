type ValueType = 'slug' | 'path'

type RedirectUpdateEvent = {
    type: ValueType
    oldValues: string[] // When multiple items are edited together, this will contain the old values of the slug
    newValue: string
    collection: string
}


type RedirectDeleteEvent = {
    type: ValueType
    values: string[]
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

type RedirectMutate = {
    id: string
    origin: string
    destination: string
}

type SluggernautSettings = {
    use_namespace: boolean;
    use_trailing_slash: boolean;
    namespace: string | null;
}

type FormattedFieldPayload = { key: string; value: string | null }

type ArchiveFieldSettings = {
    archive_field_key?: string | null;
    archive_value?: string | null;
    is_boolean: boolean;
}