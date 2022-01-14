Chained CTEs for code reuse (refactoring++)

```
with CTE1 as (
	select * from table1
),

CTE2 as (
	select * from CTE1 join table2
),
CTE3 as (
	select * from CTE2 join table2
)
```

Stacking CTEs to calculate data on top of existing CTE calculations
``` 
with CTE1 as (
	select calc1 from table1
),
CTE2 as (
	select calc1*2 as calc2 from table2
),
CTE3 as (
	select calc2/3 as calc3 from table
)
```
