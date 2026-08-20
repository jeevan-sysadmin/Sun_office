ALTER TABLE `salary`
  ADD COLUMN `funding_source` ENUM('business_income','raj_communication','owner_cash','other_borrowing')
    NOT NULL DEFAULT 'business_income' AFTER `transaction_id`,
  ADD COLUMN `funding_amount` DECIMAL(10,2)
    NOT NULL DEFAULT 0.00 AFTER `funding_source`,
  ADD COLUMN `funding_notes` TEXT
    DEFAULT NULL AFTER `funding_amount`;

UPDATE `salary`
SET
  `funding_source` = 'business_income',
  `funding_amount` = 0.00
WHERE `funding_source` IS NULL
   OR `funding_source` = '';

SELECT
  `id`,
  `staff_name`,
  `service_type`,
  `salary_month`,
  `salary_date`,
  `amount`,
  `bonus`,
  `deductions`,
  `net_amount`,
  `funding_source`,
  `funding_amount`,
  `funding_notes`,
  `payment_method`,
  `transaction_id`
FROM `salary`
ORDER BY `salary_date` DESC, `id` DESC;

SELECT
  `salary_month`,
  COUNT(*) AS `salary_count`,
  SUM(`net_amount`) AS `total_salary_paid`,
  SUM(CASE WHEN `funding_source` = 'raj_communication' THEN `funding_amount` ELSE 0 END) AS `raj_communication_used`
FROM `salary`
GROUP BY `salary_month`
ORDER BY `salary_month` DESC;

SELECT
  `id`,
  `staff_name`,
  `salary_month`,
  `salary_date`,
  `net_amount`,
  `funding_amount`,
  `funding_notes`
FROM `salary`
WHERE `funding_source` = 'raj_communication'
ORDER BY `salary_date` DESC, `id` DESC;
