# MCP Tools Monorepo

A collection of Model Context Protocol (MCP) servers and tools, built with a modular monorepo architecture. This repository contains multiple packages, including servers for location, mail, npm, and more.

## 🏗️ Architecture Overview

This project is a well-structured monorepo with the following benefits:

- **Modular Design**: Each tool is a separate package with clear separation of concerns.
- **Shared Utilities**: Common functionality is extracted into reusable packages.
- **Type Safety**: Full TypeScript support with proper type definitions.
- **Testability**: Comprehensive test suite with isolated unit tests.
- **Automated Publishing**: Versioning and publishing to npm is automated with **Changesets**.
- **Scalability**: Easy to add new tools and extend functionality.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Yarn 1.x+ (Classic)

### Installation

```bash
# Install all dependencies for all packages
yarn install
```

### Building

```bash
# Build all packages
yarn build

# Build a specific package
yarn workspace @sebse-tools/ics-parser build
```

### Development

```bash
# Start development mode with file watching for all packages
yarn dev

# Start a specific package in dev mode
yarn workspace @sebse-tools/ics-parser dev
```

### Testing

```bash
# Run all tests
yarn test

# Run tests with coverage
yarn test:coverage

# Run tests in watch mode
yarn test:watch
```

## 📦 Releasing Packages

This monorepo uses **[Changesets](https://github.com/changesets/changesets)** to manage versioning, changelogs, and publishing to npm. The release process is automated via GitHub Actions.

Here is the developer workflow for getting your changes released:

### Step 1: Make Your Code Changes

Make your code changes in any of the packages as you normally would.

### Step 2: Add a Changeset

Before you commit, run the following command to declare your intent to release:

```bash
yarn cs:add
```

This will launch an interactive CLI that will ask you:

1. Which packages have changed.
2. What the semantic version bump should be (`patch`, `minor`, or `major`) for each package.
3. A summary of the changes for the changelog.

This process creates a new markdown file in the `.changeset` directory.

### Step 3: Commit and Push

Commit your code changes _and_ the newly created changeset file.

```bash
git add .
git commit -m "feat(mail): add support for searching emails"
git push
```

### Step 4: Automated Pull Request

Once your changes are pushed to the `main` branch (or a PR is merged), the `Release` GitHub Action will trigger. It will automatically create a new Pull Request named **`Version Packages`**.

This PR bundles all new changesets, updates the `version` in the affected `package.json` files, and generates `CHANGELOG.md` files.

### Step 5: Merge and Publish

Simply review and **merge the `Version Packages` PR**. Upon merging, the same GitHub Action will run again. This time, it will build all the packages and **publish the updated versions to npm**.

## 🏛️ Architecture Principles

### Separation of Concerns

Each tool is organized into distinct layers:

- **Types**: TypeScript interfaces and type definitions
- **Helper**: Pure business logic and data processing
- **Formatter**: Output formatting and presentation
- **Handler**: MCP protocol integration
- **Index**: Tool registration and exports

### Dependency Management

The architecture promotes:

- **Clear dependencies**: Each package declares its dependencies explicitly.
- **Workspace resolution**: Internal packages use the `workspace:*` protocol to ensure they always resolve to the local version within the monorepo.

### Error Handling

Robust error handling with:

- **Input validation**: All inputs are validated before processing.
- **Graceful degradation**: Meaningful error messages for users.
- **Structured errors**: Consistent error format across tools.

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Clone the repository and install dependencies with `yarn install`.
2. Add or modify tools in their respective `packages/*` directories.
3. Add comprehensive tests for any new functionality.
4. Follow the established patterns for consistency.
5. When your changes are ready, create a changeset to document the version bump. See the **Releasing Packages** section for detailed instructions.

## 📄 License

ISC License - see the root `package.json` for details.
