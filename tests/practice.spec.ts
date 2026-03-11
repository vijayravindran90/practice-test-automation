import { expect, test } from '@playwright/test';
import { PracticeTablePage } from '../pages/practiceTablePage';
let tablePage: PracticeTablePage;

test.beforeEach(async ({ page }) => {
  tablePage = new PracticeTablePage(page);
  await tablePage.open();
});

test.describe('Practice Table Filters and Sorting', () => {
  test('1) Language filter -> Java', async ({ page }) => {
    await tablePage.selectLanguage('Java');

    const visibleLanguages = await tablePage.getVisibleLanguageValues();
    expect(visibleLanguages.length).toBeGreaterThan(0);
    expect(visibleLanguages.every((lang) => lang === 'Java')).toBeTruthy();
  });

  test('2) Level filter -> Beginner only', async ({ page }) => {
    await tablePage.setLevel('Intermediate', false);
    await tablePage.setLevel('Advanced', false);

    const levels = await tablePage.getVisibleLevels();
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.every((level) => level === 'Beginner')).toBeTruthy();
  });

  test('3) Min enrollments -> 10,000+', async ({ page }) => {

    await tablePage.selectMinEnrollments('10000');

    const enrollments = await tablePage.getVisibleEnrollments();
    expect(enrollments.length).toBeGreaterThan(0);
    expect(enrollments.every((value) => value >= 10000)).toBeTruthy();
  });

  test('4) Combined filters -> Python + Beginner + 10,000+', async ({ page }) => {

    await tablePage.selectLanguage('Python');
    await tablePage.setLevel('Intermediate', false);
    await tablePage.setLevel('Advanced', false);
    await tablePage.selectMinEnrollments('10000');

    const languages = await tablePage.getVisibleLanguageValues();
    const levels = await tablePage.getVisibleLevels();
    const enrollments = await tablePage.getVisibleEnrollments();

    expect(languages.length).toBeGreaterThan(0);
    expect(languages.every((value) => value === 'Python')).toBeTruthy();
    expect(levels.every((value) => value === 'Beginner')).toBeTruthy();
    expect(enrollments.every((value) => value >= 10000)).toBeTruthy();
  });

  test('5) No results state', async ({ page }) => {
    await tablePage.selectLanguage('Python');
    await tablePage.setLevel('Beginner', false);
    await tablePage.setLevel('Intermediate', false);
    await tablePage.selectMinEnrollments('50000');

    expect(await tablePage.getVisibleRowCount()).toBe(0);
    await expect(tablePage.coursesTable).toBeHidden();
    await expect(tablePage.noDataBanner).toBeVisible();
  });

  test('6) Reset button visibility and behavior', async ({ page }) => {
    expect(await tablePage.getResetButtonDisplayValue()).toBe('none');

    await tablePage.selectLanguage('Java');
    await expect(tablePage.resetButton).toBeVisible();

    await tablePage.clickReset();

    await expect(page.locator('input[name="lang"][value="Any"]')).toBeChecked();
    await expect(page.locator('input[name="level"][value="Beginner"]')).toBeChecked();
    await expect(page.locator('input[name="level"][value="Intermediate"]')).toBeChecked();
    await expect(page.locator('input[name="level"][value="Advanced"]')).toBeChecked();
    await expect(page.locator('#enrollDropdown')).toHaveAttribute('data-value', 'any');
    expect(await tablePage.getVisibleRowCount()).toBe(9);
    expect(await tablePage.getResetButtonDisplayValue()).toBe('none');
  });

  test('7) Sort by enrollments (ascending numeric)', async ({ page }) => {
    await tablePage.sortBy('col_enroll');

    const enrollments = await tablePage.getVisibleEnrollments();
    const sorted = [...enrollments].sort((a, b) => a - b);
    expect(enrollments).toEqual(sorted);
  });

  test('8) Sort by course name (alphabetical)', async ({ page }) => {

    await tablePage.sortBy('col_course');
    const courses = await tablePage.getVisibleCourseNames();
    const sorted = [...courses].sort((a, b) => a.localeCompare(b));
    expect(courses).toEqual(sorted);
  });

  test('9) Language filter reapplies on Java -> Python change', async ({ page }) => {
    await tablePage.selectLanguage('Java');
    const javaLanguages = await tablePage.getVisibleLanguageValues();
    expect(javaLanguages.length).toBeGreaterThan(0);
    expect(javaLanguages.every((lang) => lang === 'Java')).toBeTruthy();

    await tablePage.selectLanguage('Python');
    const pythonLanguages = await tablePage.getVisibleLanguageValues();
    expect(pythonLanguages.length).toBeGreaterThan(0);
    expect(pythonLanguages.every((lang) => lang === 'Python')).toBeTruthy();
  });

  test('10) Language filter reapplies on Java -> Any change', async ({ page }) => {
    await tablePage.selectLanguage('Java');
    expect(await tablePage.getVisibleRowCount()).toBeGreaterThan(0);

    await tablePage.selectLanguage('Any');
    const languages = await tablePage.getVisibleLanguageValues();
    expect(await tablePage.getVisibleRowCount()).toBe(9);
    expect(languages).toContain('Java');
    expect(languages).toContain('Python');
    expect(languages).toContain('Any');
  });
});
