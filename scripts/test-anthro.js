import {
  calculateBodyDensityPollock3,
  calculateBodyDensityPollock7,
  calculateBodyFatPercent,
  isMalePatient,
  calculateBodyDensity
} from '../src/lib/utils/anthropometry-calculations.js';

async function runTests() {
  console.log("=== ANTHROPOMETRY VALIDATION TESTS ===\n");
  let passed = 0;
  let failed = 0;

  function assertEqual(testName, actual, expected, tolerance = 0.001) {
    if (actual === null && expected === null) {
      console.log(`✅ PASS: ${testName} (Both are null)`);
      passed++;
      return;
    }
    if (actual === null || expected === null) {
      console.log(`❌ FAIL: ${testName} | Expected ${expected}, got ${actual}`);
      failed++;
      return;
    }
    if (Math.abs(actual - expected) < tolerance) {
      console.log(`✅ PASS: ${testName} | Value: ${actual.toFixed(4)}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${testName} | Expected ${expected}, got ${actual.toFixed(4)}`);
      failed++;
    }
  }

  function assertTrue(testName, actual) {
    if (actual === true) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${testName} | Expected true, got ${actual}`);
      failed++;
    }
  }

  function assertFalse(testName, actual) {
    if (actual === false) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${testName} | Expected false, got ${actual}`);
      failed++;
    }
  }

  // --- 1. Test isMalePatient Helper ---
  console.log("--- isMalePatient Helper ---");
  assertTrue('Recognizes "homem"', isMalePatient("homem"));
  assertTrue('Recognizes "MASCULINO"', isMalePatient("MASCULINO"));
  assertTrue('Recognizes "m"', isMalePatient("m"));
  assertFalse('Rejects "feminino"', isMalePatient("feminino"));
  assertFalse('Rejects "mulher"', isMalePatient("mulher"));
  assertFalse('Rejects null', isMalePatient(null));
  console.log("");

  // --- 2. Test calculateBodyDensityPollock3 ---
  console.log("--- Pollock 3 ---");
  const maleSkinfolds = { peito: 10, abdominal: 10, coxa: 10, triceps: 99, suprailiaca: 99 };
  assertEqual('Pollock 3 (Male)', calculateBodyDensityPollock3(maleSkinfolds, 25, true), 1.079584);
  
  const femaleSkinfolds = { peito: 99, abdominal: 99, coxa: 15, triceps: 15, suprailiaca: 15 };
  assertEqual('Pollock 3 (Female)', calculateBodyDensityPollock3(femaleSkinfolds, 25, false), 1.0559891);
  console.log("");

  // --- 3. Test handle 0 values ---
  console.log("--- Handling Zeros ---");
  const maleZeroSkinfolds = { peito: 0, abdominal: 10, coxa: 10 };
  const bdZero = calculateBodyDensityPollock3(maleZeroSkinfolds, 25, true);
  assertTrue('Pollock 3 handles 0 without returning null', bdZero !== null);
  console.log("");

  // --- 4. Test missing values ---
  console.log("--- Missing Values ---");
  const maleMissingSkinfolds = { peito: 10, abdominal: 10 };
  assertEqual('Pollock 3 missing fold returns null', calculateBodyDensityPollock3(maleMissingSkinfolds, 25, true), null);
  console.log("");

  // --- 5. Test Siri Clipping ---
  console.log("--- Siri Body Fat % Clipping ---");
  assertEqual('Siri Normal', calculateBodyFatPercent(1.05), 21.428);
  assertEqual('Siri Lower Bound (Negative)', calculateBodyFatPercent(1.12), 2.0);
  assertEqual('Siri Upper Bound', calculateBodyFatPercent(0.95), 70.0);

  // --- 6. Test Wrapper function ---
  console.log("\n--- Wrapper calculateBodyDensity ---");
  const bdWrapper = calculateBodyDensity(maleSkinfolds, 25, true, 'pollock3');
  assertEqual('Wrapper correct routing', bdWrapper, 1.079584);

  console.log("\n=================================");
  console.log(`TOTAL PASSED: ${passed}`);
  console.log(`TOTAL FAILED: ${failed}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
