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

## Working with Changesets

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

We follow [Conventional Commits](https://www.conventionalcommits.org/) to keep a clean and structured git history.

**Format:**
   ```sh
   <type>(<scope>): <description>
   ```

- **`type`**: Describes the change category.
  - `feat`: A new feature.
  - `fix`: A bug fix.
  - `chore`: Maintenance tasks, such as dependencies.
  - `docs`: Documentation updates.
  - `refactor`: Code changes that do not add features or fix bugs.
  - `test`: Adding or improving tests.
  - `ci`: CI/CD configuration updates.

- **`scope`**: The affected package or module (optional but recommended).
- **`description`**: A short, imperative sentence describing the change.

**Examples:**
   ```sh
   feat(directus-redirects): add support for custom redirect rules
   fix(auth): resolve login token expiration issue
   chore(deps): update directus dependency to latest version
   ```

For breaking changes, add `!` after the type:

   ```sh
   feat!: remove deprecated API endpoints
   ```

## Submitting a Pull Request

1. Push your branch to GitHub:

   ```sh
   git push origin feature/my-new-feature
   ```

2. Open a Pull Request against `main`.
3. A maintainer will review and merge it if everything looks good.

