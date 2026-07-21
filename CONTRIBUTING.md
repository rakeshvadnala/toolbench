# Contributing

Thank you for considering contributing to Toolbench!

## Steps

1. Fork the repository
2. Create a new feature branch
3. Commit your changes
4. Push your branch
5. Open a Pull Request

## Adding a new tool

Toolbench uses a plugin registry — you don't need to touch the shell:

1. Open `app.js`
2. Add a new `registerTool({ id, name, category, icon, mount(container, api) {...} })` block
3. `category` must be `'Core Tools'` or `'Developer Utilities'` to show up in the sidebar
4. `mount` receives the pane element and an `api` object (`setStatus`, `setTitle`) — it should render the tool's UI and wire up its own event listeners
5. Return a cleanup function from `mount` if your tool needs to tear down timers or listeners when its tab closes

Please keep code clean, dependency-free where possible, and well documented.
