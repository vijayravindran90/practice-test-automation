import { expect, type Locator, type Page } from '@playwright/test';

export class PracticeTablePage {
  readonly page: Page;
  readonly coursesTable: Locator;
  readonly noDataBanner: Locator;
  readonly resetButton: Locator;
  readonly sortSelect: Locator;

  constructor(page: Page) {
    this.page = page;
    this.coursesTable = page.locator('#courses_table');
    this.noDataBanner = page.locator('#noData');
    this.resetButton = page.locator('#resetFilters');
    this.sortSelect = page.locator('#sortBy');
  }

  async open(): Promise<void> {
    await this.page.goto('https://practicetestautomation.com/practice-test-table/');
    await expect(this.coursesTable).toBeVisible();
  }

  async selectLanguage(language: 'Any' | 'Java' | 'Python'): Promise<void> {
    await this.page.locator(`input[name="lang"][value="${language}"]`).check();
  }

  async setLevel(level: 'Beginner' | 'Intermediate' | 'Advanced', checked: boolean): Promise<void> {
    const checkbox = this.page.locator(`input[name="level"][value="${level}"]`);
    if (checked) {
      await checkbox.check();
      return;
    }

    await checkbox.uncheck();
  }

  async selectMinEnrollments(value: 'any' | '5000' | '10000' | '50000'): Promise<void> {
    await this.page.locator('#enrollDropdown .dropdown-button').click();
    await this.page.locator(`#enrollDropdown .dropdown-menu li[data-value="${value}"]`).click();
  }

  async sortBy(columnId: 'col_id' | 'col_course' | 'col_lang' | 'col_level' | 'col_enroll'): Promise<void> {
    await this.sortSelect.selectOption(columnId);
  }

  async clickReset(): Promise<void> {
    await this.resetButton.click();
  }

  async getVisibleRowCount(): Promise<number> {
    return this.page.locator('#courses_table tbody tr').evaluateAll((rows) => {
      return rows.filter((row) => {
        return window.getComputedStyle(row).display !== 'none';
      }).length;
    });
  }

  async getVisibleLanguageValues(): Promise<string[]> {
    return this.page.locator('#courses_table tbody tr').evaluateAll((rows) => {
      return rows
        .filter((row) => window.getComputedStyle(row).display !== 'none')
        .map((row) => row.querySelector('td[data-col="language"]')?.textContent?.trim() ?? '')
        .filter(Boolean);
    });
  }

  async getVisibleLevels(): Promise<string[]> {
    return this.page.locator('#courses_table tbody tr').evaluateAll((rows) => {
      return rows
        .filter((row) => window.getComputedStyle(row).display !== 'none')
        .map((row) => row.querySelector('td[data-col="level"]')?.textContent?.trim() ?? '')
        .filter(Boolean);
    });
  }

  async getVisibleEnrollments(): Promise<number[]> {
    return this.page.locator('#courses_table tbody tr').evaluateAll((rows) => {
      return rows
        .filter((row) => window.getComputedStyle(row).display !== 'none')
        .map((row) => {
          const value = row.querySelector('td[data-col="enrollments"]')?.textContent ?? '';
          return Number(value.replace(/[, ]/g, ''));
        });
    });
  }

  async getVisibleCourseNames(): Promise<string[]> {
    return this.page.locator('#courses_table tbody tr').evaluateAll((rows) => {
      return rows
        .filter((row) => window.getComputedStyle(row).display !== 'none')
        .map((row) => row.querySelector('td[data-col="course"]')?.textContent?.trim() ?? '')
        .filter(Boolean);
    });
  }

  async getResetButtonDisplayValue(): Promise<string> {
    return this.resetButton.evaluate((button) => window.getComputedStyle(button).display);
  }

  async isNoDataVisible(): Promise<boolean> {
    return this.noDataBanner.isVisible();
  }
}
