### Introduction
1. What makes this book unique
2. What are design patterns
3. How is this book organized

### Part 1 - Core Principles
1. Data Granularity
2. Common Table Expressions (CTEs)
3. Joining Data
		1. Why nobody ever uses a RIGHT OUTER JOIN
		2. Why would you ever use a FULL OUTER JOIN
			1. See chapter on table comparison
		3. Why would you ever use a CROSS JOIN
			1. See chapter on Spine Table
4. Filtering Data
		1. Using subqueries in the WHERE clause
		2. Multiple conditions in the WHERE clause
		3. Filtering LEFT JOINs
5. Aggregating Data
	1. Aggregate functions
	2. GROUP BY
6. Appending Rows
	1. UNION (DISTINCT)
	2. UNION ALL

### Part 2 - Design Patterns
1. Query Decomposition Patterns
	1. Principles / Rules / Best Practices
		1. Bottom up vs top down decomposition
			1. Start with the ground truth
		2. Use CTEs to decompose a query into building blocks
		3. Keep the building blocks small and single purpose
	2. Meta Patterns
		1. Using Linear CTEs
		2. Using Nested CTEs
		3. Using Views
2. Query Maintainability Patterns
	1. Principles / Rules / Best Practices
		1. Don't Repeat Yourself (DRY)
		2. Don't mix levels of abstraction
		3. Refactor reusable code into CTEs
	2. Wide Tables 
		1. Denormalizing OLTP databases
	3. Nested Logic
3. Query Robustness Patterns
	1.  Principles / Rules / Best Practices
		1. Expect the Unexpected
			1. Dealing with NULLs
			2. Dealing with duplicate rows
			3. Dealing with type conversions
			4. Dealing with divide by zero
		2. Start With a LEFT OUTER JOIN
		3. Granularity Alignment
4. Query Performance Patterns
	1.  Principles / Rules / Best Practices
		1. Only select the columns you need
		2. Reduce your data before joining
		3. Choose the faster method
	2. Pre-Aggregation
	3. Pre-Calculation
	4. Pre-Filtering
5. Special Cases
	1. Data Reshaping - Pivoting and De-Pivoting
	2. Custom Grouping
	3. Custom Ranking
	4. Replacing OR with UNION
	5. Spine Table
		1. Calendar table
		2. Parameter table
	6. Reference Table Filtering
	7. Multi-Step Calculation
	8. JSON Parsing
	9. Regular Expressions
	10. Time Series Tables