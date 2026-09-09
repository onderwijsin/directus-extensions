TODO's for later:

- Im seeing some laziness around jsdocs...
  `     /**     * Editor callback.     * @param editor Parameter value.     * @param component Parameter value.     * @param props Parameter value.     * @returns Callback result.     */     `
  We should do a js docs pass to properly add well documented js docs

- Our guard utils (and probably also object utils and attempt methods) are not utilized. We shoudl
  do a full sweep of the extension and implement the appropriate utils

- We need to add a user / editor facing doc through `startup.documentation()`
