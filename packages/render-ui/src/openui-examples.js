// OpenUI Lang positional arguments follow each component's Zod object key order.
// Examples use only standard upstream OpenUI components.
export const customExamples = [
  `root = Stack([Card([CardHeader("Dashboard", "Tabs and charts"), tabs])])
tabs = Tabs([TabItem("overview", "Overview", [TextContent("Overview content", "default")]), TabItem("details", "Details", [Table([Col("Name", ["A","B","C"]), Col("Value", [1,2,3], "number")])])])`,
  `root = Stack([Card([CardHeader("Sales", "Quarterly revenue"), BarChart(["Q1","Q2","Q3","Q4"], [Series("Revenue", [120,140,160,180])])])])`,
  // Live data pattern: button sends structured tool request to agent
  `root = Stack([Card([CardHeader("Live Data", "Request real data from agent"), Stack([TextContent("Click to fetch live data from available tools.", "default"), refreshBtn])])
refreshBtn = Button("Fetch Latest Data", Action([@ToAssistant("Please fetch the latest data and update this dashboard.", {tool: "web_search", query: "latest business metrics"})]), "primary")`,
];
export const openuiCustomExamples = customExamples;
export default customExamples;