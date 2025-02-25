type SlugUpdateEvent = {
    oldValues: string[] // When multiple items are edited together, this will contain the old values of the slug
    newValue: string
    collection: string
}

type SlugDeleteEvent = {
    slugs: string[]
}