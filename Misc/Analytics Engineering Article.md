# Why Analytics Engineering is Here to Stay
I started my career as a business analyst. As I slowly transitioned into working with data as an analyst, data scientist and data engineer, I fell in love with data modeling and SQL development. In retrospect, I consider myself an *Analytics Engineer*.

While the title *Analytics Engineer* is relatively new, the role has always existed in one way shape or form and I believe it’s here to stay.

As an analytics engineer your job is to design and build usable, well-documented data models for analysts and data scientists to use. These models serve as the building blocks on top of which metrics and KPIs are defined and the core business dashboards are built.

To the untrained eye, these models are simply tables or views in a database (or data warehouse.) To a professional, however, these models encode some of the most crucial knowledge about the organization.

Fred Brooks, in _The Mythical Man-Month_, wrote:

> Show me your flowchart and conceal your tables, and I shall continue to be mystified. Show me your tables, and I won't usually need your flowchart; it'll be obvious.

Eric Raymond, in _The Cathedral and the Bazaar_, wrote a similar statement, perhaps reiterating Brook's message:

> Show me your code and conceal your data structures, and I shall continue to be mystified. Show me your data structures, and I won't usually need your code; it'll be obvious.

In our case the data structures are the schemas of the tables AEs build. The primary keys that capture the important entities in a business; the foreign keys that determine the relationships between those entities and the data types that ensure clean data is delivered at all times.

Analytics engineers sit between the worlds of data engineers and data analysts/scientists acting as the glue that binds together business context with the organization's data. The models they build are critical in understanding that context. 

Every organization is unique with different concepts, entities and relationships. There’s no single way to model and no universal models. There are certain patterns (e.g. star schemas, data vault, etc.) but the models are all unique.

While data engineers have been doing part of this role in the past, their core purpose is to build the complex infrastructure that ships raw data to the warehouse. They often don’t have enough business context to know how to shape that data for analysis.

Data analysts and scientists have also played this role in the past but again their true purpose is to deliver data products (insights, dashboards, ml models) If given a choice, they’ll happily focus on that instead of transforming and preparing data for it.

Building these models requires human ingenuity and creativity. It’s a complex problem that will continue to exist and cannot be automated. As the business evolves, these models also need to evolve. That also cannot be automated.

And that is ultimately why I believe that analytics engineering is here to stay and not going anywhere. If you love SQL, are fascinated by software engineering, but you don’t want to do analysis or machine learning then this is the right career for you.

I have enjoyed working in this field for a while and I’m very passionate about it. That’s why I’m teaching a course with [co:rise](https://www.linkedin.com/company/co-rise/) on the data modeling aspects of it. I’m also working on a career guide for those who want to learn more. Make sure you follow me on [Twitter](https:\\twitter.com\ergestx) for more updates.