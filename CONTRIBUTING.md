# Contributing

Thanks for your interest in contributing! Please follow these guidelines to keep everything consistent.

## Prerequisites

Ensure you have the following installed:
- [Docker](https://www.docker.com/get-started)
- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/installation)

## Getting Started

1. Fork the repository and clone your fork.
2. Install dependencies:

   ```sh
   pnpm install
   ```

3. Create a new branch for your changes:

   ```sh
   git checkout -b feat/my-new-feature
   ```
   
4. Start your Docker container by running ``pnpm start`` in the root of the project. Ensure Docker is installed and running.

### Creating a new extension
After starting Docker, open a new terminal:
   
   ```sh
   cd packages/
   pnpm dlx create-directus-extension@latest
   ```

Follow the prompts in your terminal to create the new extension. Afterwards, navigate to the extension directory and run ``pnpm dev``. The Directus instance running in your Docker container will be auto reloaded if changes are detected.

### Working on existing extensions
For each package you're working on, you'll want to ensure that the Directus instance in your running Docker container is auto reloaded. You can do this by navigating to the extensions directory, and running ``pnpm dev``.

## Making Changes

- Follow the project's coding style.
- Ensure your code is well-tested.
- If modifying a package, **create a Changeset**.
- **Lint your code** to ensure it adheres to the project's coding standards.

### Linting Your Code

We use [ESLint](https://eslint.org/) to maintain code quality and consistency. Before committing your changes, make sure to run ESLint and fix any issues:

   ```sh
   pnpm lint
   ```

To automatically fix linting errors, you can run:

   ```sh
   pnpm lint:fix
   ```

Ensure that your code passes all linting checks before submitting a pull request.

### Working with Changesets

We use [Changesets](https://github.com/changesets/changesets) to manage versioning. Whenever you modify a package, create a changeset:

   ```sh
   pnpm changeset
   ```

1. Select the affected package(s).
2. Choose a version bump (`patch`, `minor`, `major`).
3. Provide a short description of your change.

Commit the changeset with your code:

   ```sh
   git add .
   git commit -m "feat(package-name): added new feature [changeset]"
   ```

### Do not run `pnpm changeset version` or `pnpm changeset publish`
This is handled by the **GitHub Actions release workflow**.

## Commit Message Best Practices

We follow [Conventional Commits](https://www.conventionalcommits.org/) to keep a clean and structured git history. This ensures our commit messages are human- and machine-readable.

**Format:**
   ```sh
   <type>(<scope>): <description>
   ```

- **`type`**: Describes the change category.
  - `feat`: A new feature.
  - `fix`: A bug fix.
  - `chore`: Maintenance tasks, such as dependencies.
  - `style`: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc) 
  - `docs`: Documentation updates.
  - `refactor`: Code changes that do not add features or fix bugs.
  - `perf`: A code change that improves performance 
  - `test`: Adding or improving tests.
  - `ci`: CI/CD configuration updates.
  - `build`: Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm) 
  - `revert`: Reverts a previous commit 

- **`scope`**: The affected package or module (optional but recommended).
- **`description`**: A short, imperative sentence describing the change.

**Examples:**
   ```sh
   feat(sluggernaut): add support for custom redirect rules
   docs: update readme
   chore(deps): update directus dependency to latest version
   ```

For breaking changes, add `!` after the type:

   ```sh
   feat!: remove deprecated API endpoints
   ```

### Commit Message Enforcement
We use commitlint to ensure that commit messages follow the **Conventional Commit** format. If your commit message doesn’t follow the standard, **Husky** will prevent the commit from going through.

To make committing easier, use ``pnpm commit`` to trigger a guided commit flow via **Commitizen**, which automatically formats your commit message. When running ``pnpm commit``, you'll be prompted to select the type, scope, and description of your commit, ensuring that your commit message adheres to the correct format.

## Submitting a Pull Request

1. Make sure your commit history contains a [changeset](#working-with-changesets) describing your proposed changes
2. Push your branch to GitHub:

   ```sh
   git push origin feature/my-new-feature
   ```

3. Open a Pull Request against `main`.
4. A maintainer will review and merge it if everything looks good.

