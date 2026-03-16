/**
 * Unit tests for lib/validate-sort.js
 *
 * These tests run without a browser and prove the sort validation logic
 * itself is correct — independent of whether HN happens to be sorted today.
 * A validator that can't catch violations isn't a validator.
 */
const { test, expect } = require("@playwright/test");
const { checkSortOrder } = require("../lib/validate-sort");

test.describe("checkSortOrder", () => {
  test("returns no violations for correctly sorted timestamps", () => {
    const sorted = [
      "2024-01-15T10:00:00",
      "2024-01-15T09:00:00",
      "2024-01-15T08:00:00",
    ];
    const { violations } = checkSortOrder(sorted);
    expect(violations.size).toBe(0);
  });

  test("detects out-of-order timestamps as violations", () => {
    // oldest article is first — clearly wrong
    const unsorted = [
      "2024-01-15T08:00:00",
      "2024-01-15T10:00:00",
      "2024-01-15T09:00:00",
    ];
    const { violations, details } = checkSortOrder(unsorted);
    expect(violations.size).toBeGreaterThan(0);
    // positions 0 and 1 are involved in the first violation
    expect(violations.has(0)).toBe(true);
    expect(violations.has(1)).toBe(true);
    expect(details.length).toBeGreaterThan(0);
  });

  test("allows ties — same-second timestamps are not violations", () => {
    const withTie = [
      "2024-01-15T10:00:00",
      "2024-01-15T10:00:00", // same second as previous
      "2024-01-15T09:00:00",
    ];
    const { violations } = checkSortOrder(withTie);
    expect(violations.size).toBe(0);
  });

  test("skips null timestamps without producing false violations", () => {
    // positions 0 and 2 are in order; position 1 is null and should be ignored
    const withNull = [
      "2024-01-15T10:00:00",
      null,
      "2024-01-15T08:00:00",
    ];
    const { violations } = checkSortOrder(withNull);
    expect(violations.size).toBe(0);
  });

  test("handles all-null input without throwing", () => {
    const { violations } = checkSortOrder([null, null, null]);
    expect(violations.size).toBe(0);
  });

  test("handles a single-element array without throwing", () => {
    const { violations } = checkSortOrder(["2024-01-15T10:00:00"]);
    expect(violations.size).toBe(0);
  });

  test("handles an empty array without throwing", () => {
    const { violations } = checkSortOrder([]);
    expect(violations.size).toBe(0);
  });

  test("handles adjacent null timestamps without throwing or false violations", () => {
    const adjacentNulls = [
      "2024-01-15T10:00:00",
      null,
      null,
      "2024-01-15T08:00:00",
    ];
    const { violations } = checkSortOrder(adjacentNulls);
    expect(violations.size).toBe(0);
  });

  test("reports violation details with correct indices and timestamps", () => {
    const input = [
      "2024-01-15T08:00:00", // older article listed first — violation
      "2024-01-15T10:00:00",
    ];
    const { details } = checkSortOrder(input);
    expect(details).toHaveLength(1);
    expect(details[0].i).toBe(0);
    expect(details[0].current).toBe("2024-01-15T08:00:00");
    expect(details[0].next).toBe("2024-01-15T10:00:00");
  });
});
