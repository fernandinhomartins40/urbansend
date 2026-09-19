const requestedScope = process.argv[2];

const requiredFlagByScope = {
  e2e: 'RUN_E2E_TESTS',
  performance: 'RUN_PERFORMANCE_TESTS'
};

const requiredFlag = requiredFlagByScope[requestedScope];

if (!requiredFlag) {
  throw new Error(`Unknown explicit test scope: ${requestedScope || '(missing)'}`);
}

if (process.env[requiredFlag] !== 'true') {
  console.error(
    `${requestedScope} tests are not part of the default local gate. ` +
    `Run only against a disposable environment with ${requiredFlag}=true.`
  );
  process.exit(1);
}

console.log(`${requestedScope} test scope explicitly authorized.`);
