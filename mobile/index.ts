import { registerRootComponent } from "expo";
try {
  const App = require("./App").default;
  registerRootComponent(App);
} catch (error) {
  // Diagnostics only while developing: a release build must not print stacks to the device log.
  if (__DEV__)
    console.log(
      "BOOTSTRAP_STACK_JSON",
      JSON.stringify(error instanceof Error ? error.stack : error),
    );
  throw error;
}
