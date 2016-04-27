'use strict';

/*
 * Copyright 2016 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var charts = charts || {};
var mediators = mediators || {};

var neonColors = neonColors || {};
neonColors.GREEN = '#39b54a';
neonColors.RED = '#C23333';
neonColors.BLUE = '#3662CC';
neonColors.ORANGE = "#ff7f0e";
neonColors.PURPLE = "#9467bd";
neonColors.BROWN = "#8c564b";
neonColors.PINK = "#e377c2";
neonColors.GRAY = "#7f7f7f";
neonColors.YELLOW = "#bcbd22";
neonColors.CYAN = "#17becf";
neonColors.LIGHT_GREEN = "#98df8a";
neonColors.LIGHT_RED = "#ff9896";
neonColors.LIGHT_BLUE = "#aec7e8";
neonColors.LIGHT_ORANGE = "#ffbb78";
neonColors.LIGHT_PURPLE = "#c5b0d5";
neonColors.LIGHT_BROWN = "#c49c94";
neonColors.LIGHT_PINK = "#f7b6d2";
neonColors.LIGHT_GRAY = "#c7c7c7";
neonColors.LIGHT_YELLOW = "#dbdb8d";
neonColors.LIGHT_CYAN = "#9edae5";
neonColors.LIST = [
    neonColors.GREEN,
    neonColors.RED,
    neonColors.BLUE,
    neonColors.ORANGE,
    neonColors.PURPLE,
    neonColors.BROWN,
    neonColors.PINK,
    neonColors.GRAY,
    neonColors.YELLOW,
    neonColors.CYAN,
    neonColors.LIGHT_GREEN,
    neonColors.LIGHT_RED,
    neonColors.LIGHT_BLUE,
    neonColors.LIGHT_ORANGE,
    neonColors.LIGHT_PURPLE,
    neonColors.LIGHT_BROWN,
    neonColors.LIGHT_PINK,
    neonColors.LIGHT_GRAY,
    neonColors.LIGHT_YELLOW,
    neonColors.LIGHT_CYAN
];
neonColors.DEFAULT = neonColors.GRAY;

// Mappings used in the JSON configuration file.
var neonMappings = neonMappings || {};
neonMappings.DATE = "date";
neonMappings.TAGS = "tags";
neonMappings.URLS = "url";
neonMappings.LATITUDE = "latitude";
neonMappings.LONGITUDE = "longitude";
neonMappings.SOURCE_LATITUDE = "source_latitude";
neonMappings.SOURCE_LONGITUDE = "source_longitude";
neonMappings.TARGET_LATITUDE = "target_latitude";
neonMappings.TARGET_LONGITUDE = "target_longitude";
neonMappings.COLOR = "color_by";
neonMappings.NODE_COLOR_BY = "nodeColorBy";
neonMappings.LINE_COLOR_BY = "lineColorBy";
neonMappings.SIZE = "size_by";
neonMappings.NODE_SIZE = "node_size";
neonMappings.LINE_SIZE = "line_size";
neonMappings.SORT = "sort_by";
neonMappings.AGGREGATE = "count_by";
neonMappings.Y_AXIS = "y_axis";
neonMappings.BAR_GROUPS = "bar_x_axis";
neonMappings.LINE_GROUPS = "line_category";
neonMappings.SCATTERPLOT_X_AXIS = "x_attr";
neonMappings.SCATTERPLOT_Y_AXIS = "y_attr";
neonMappings.GRAPH_NODE = "graph_nodes";
neonMappings.GRAPH_LINKED_NODE = "graph_links";
neonMappings.GRAPH_NODE_NAME = "graph_node_name";
neonMappings.GRAPH_LINKED_NODE_NAME = "graph_link_name";
neonMappings.GRAPH_NODE_SIZE = "graph_node_size";
neonMappings.GRAPH_LINKED_NODE_SIZE = "graph_link_size";
neonMappings.GRAPH_FLAG = "graph_flag";
neonMappings.GRAPH_FLAG_MODE = "graph_flag_mode";
neonMappings.GRAPH_TOOLTIP_ID_LABEL = "graph_tooltip_id_label";
neonMappings.GRAPH_TOOLTIP_DATA_LABEL = "graph_tooltip_data_label";
neonMappings.GRAPH_TOOLTIP_NAME_LABEL = "graph_tooltip_name_label";
neonMappings.GRAPH_TOOLTIP_SIZE_LABEL = "graph_tooltip_size_label";
neonMappings.GRAPH_TOOLTIP_FLAG_LABEL = "graph_tooltip_flag_label";
neonMappings.GRAPH_TOOLTIP_SOURCE_NAME_LABEL = "graph_tooltip_source_name_label";
neonMappings.GRAPH_TOOLTIP_TARGET_NAME_LABEL = "graph_tooltip_target_name_label";
neonMappings.GRAPH_TOOLTIP_SOURCE_SIZE_LABEL = "graph_tooltip_source_size_label";
neonMappings.GRAPH_TOOLTIP_TARGET_SIZE_LABEL = "graph_tooltip_target_size_label";
neonMappings.NEWSFEED_NAME = "newsfeed_name";
neonMappings.NEWSFEED_TYPE = "newsfeed_type";
neonMappings.NEWSFEED_TEXT = "newsfeed_text";
neonMappings.NEWSFEED_AUTHOR = "newsfeed_author";
neonMappings.START_DATE = "startDate";
neonMappings.END_DATE = "endDate";
neonMappings.MIN_LAT = "minLat";
neonMappings.MIN_LON = "minLon";
neonMappings.MAX_LAT = "maxLat";
neonMappings.MAX_LON = "maxLon";
neonMappings.BOUNDS = "bounds";
neonMappings.POINT = "point";

var neonWizard = neonWizard || {};

neonWizard.mappings = neonWizard.mappings || {};
neonWizard.mappings.DATE = {
    name: "date",
    prettyName: "Date"
};
neonWizard.mappings.TAGS = {
    name: "tags",
    prettyName: "Tag Cloud Field"
};
neonWizard.mappings.LATITUDE = {
    name: "latitude",
    prettyName: "Latitude"
};
neonWizard.mappings.LONGITUDE = {
    name: "longitude",
    prettyName: "Longitude"
};
neonWizard.mappings.COLOR = {
    name: "color_by",
    prettyName: "Map Color By"
};
neonWizard.mappings.SIZE = {
    name: "size_by",
    prettyName: "Map Size By"
};
neonWizard.mappings.SORT = {
    name: "sort_by",
    prettyName: "Data Table Sort By"
};
neonWizard.mappings.AGGREGATE = {
    name: "count_by",
    prettyName: "Aggregation Table Field"
};
neonWizard.mappings.Y_AXIS = {
    name: "y_axis",
    prettyName: "Y-Axis"
};
neonWizard.mappings.BAR_GROUPS = {
    name: "bar_x_axis",
    prettyName: "Bar Chart X-Axis"
};
neonWizard.mappings.LINE_GROUPS = {
    name: "line_category",
    prettyName: "Line Chart Grouping"
};
neonWizard.mappings.GRAPH_NODE = {
    name: "graph_nodes",
    prettyName: "Graph Nodes"
};
neonWizard.mappings.GRAPH_LINKED_NODE = {
    name: "graph_links",
    prettyName: "Graph Linked Nodes"
};
neonWizard.mappings.GRAPH_NODE_NAME = {
    name: "graph_node_name",
    prettyName: "Graph Nodes Name"
};
neonWizard.mappings.GRAPH_LINKED_NODE_NAME = {
    name: "graph_link_name",
    prettyName: "Graph Linked Nodes Name"
};
neonWizard.mappings.GRAPH_NODE_SIZE = {
    name: "graph_node_size",
    prettyName: "Graph Node Size"
};
neonWizard.mappings.GRAPH_LINKED_NODE_SIZE = {
    name: "graph_link_size",
    prettyName: "Graph Linked Node Size"
};
neonWizard.mappings.GRAPH_FLAG = {
    name: "graph_flag",
    prettyName: "Graph Flag Field"
};
neonWizard.mappings.NEWSFEED_TEXT = {
    name: "newsfeed_text",
    prettyName: "Graph Text Field"
};

neonWizard.visualizationBindings = neonWizard.visualizationBindings || {};
neonWizard.visualizationBindings.barchart = [
    {
        label: "X-Axis",
        name: "bind-x-axis-field",
        bindingName: "bar_x_axis"
    },{
        label: "Aggregation",
        name: "bind-aggregation",
        options: [
            {
                name: "count",
                prettyName: "Count",
                defaultOption: true
            },{
                name: "sum",
                prettyName: "Sum"
            },{
                name: "average",
                prettyName: "Average"
            }
        ]
    },{
        label: "Y-Axis",
        name: "bind-y-axis-field",
        bindingName: "y_axis"
    }
];
neonWizard.visualizationBindings["circular-heat-form"] = [
    {
        label: "Date Field",
        name: "bind-date-field",
        bindingName: "date"
    }
];
neonWizard.visualizationBindings["count-by"] = [
    {
        label: "Group Field",
        name: "bind-group-field",
        bindingName: "count_by"
    },{
        label: "Aggregation",
        name: "bind-aggregation",
        options: [
            {
                name: "count",
                prettyName: "Count",
                defaultOption: true
            },{
                name: "min",
                prettyName: "Minimum"
            },{
                name: "max",
                prettyName: "maximum"
            }
        ]
    },{
        label: "Aggregation Field",
        name: "bind-aggregation-field"
    }
];
neonWizard.visualizationBindings["directed-graph"] = [];
neonWizard.visualizationBindings["filter-builder"] = [];
neonWizard.visualizationBindings["gantt-chart"] = [
    {
        label: "Start Field",
        name: "bind-start-field"
    },{
        label: "End Field",
        name: "bind-end-field"
    },{
        label: "Color Field",
        name: "bind-color-field"
    }
];
neonWizard.visualizationBindings.linechart = [
    {
        label: "Date Granularity",
        name: "bind-granularity",
        options: [
            {
                name: "day",
                prettyName: "Day",
                defaultOption: true
            },{
                name: "hour",
                prettyName: "Hour"
            }
        ]
    }
];
neonWizard.visualizationBindings.map = [];
neonWizard.visualizationBindings.newsfeed = [
    {
        label: "Primary Title Field",
        name: "bind-primary-title-field"
    },{
        label: "Secondary Title Field",
        name: "bind-secondary-title-field"
    },{
        label: "Date Field",
        name: "bind-date-field",
        bindingName: "date"
    },{
        label: "Content Field",
        name: "bind-content-field"
    }
];
neonWizard.visualizationBindings["plotly-graph"] = [
    {
        label: "X Attribute",
        name: "bind-x-axis-field"
    },{
        label: "Y Attribute",
        name: "bind-y-axis-field"
    },{
        label: "Type",
        name: "graph-type",
        options: [
            {
                name: "scatter",
                prettyName: "Scatter Plot",
                defaultOption: true
            },{
                name: "heatmapScatter",
                prettyName: "Heatmap Scatter Plot"
            },{
                name: "histogramScatter",
                prettyName: "Histogram Plot"
            }
        ]
    }
];
neonWizard.visualizationBindings["query-results-table"] = [];
neonWizard.visualizationBindings.sunburst = [];
neonWizard.visualizationBindings["tag-cloud"] = [
    {
        label: "Data Field",
        name: "bind-tag-field",
        bindingName: "tags"
    }
];
neonWizard.visualizationBindings["timeline-selector"] = [
    {
        label: "Date Field",
        name: "bind-date-field",
        bindingName: "date"
    },{
        label: "Date Granularity",
        name: "bind-granularity",
        options: [
            {
                name: "year",
                prettyName: "Year"
            },{
                name: "month",
                prettyName: "Month"
            },{
                name: "day",
                prettyName: "Day",
                defaultOption: true
            },{
                name: "hour",
                prettyName: "Hour"
            }
        ]

    }
];

var neonVisualizations = [{
    name: "Aggregation Table",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "aggregationTable",
    icon: "Count64"
}, {
    name: "Bar Chart",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "barChart",
    icon: "BarChart64"
}, {
    name: "Data Table",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "dataTable",
    icon: "ViewData64"
}, {
    name: "Document Viewer",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "documentViewer",
    icon: "DocumentViewer64"
}, {
    name: "Filter Builder",
    minSizePercentageX: 0.50,
    minSizePercentageY: 0.20,
    type: "filterBuilder",
    icon: "CreateFilter64"
}, {
    name: "Gantt Chart",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "ganttChart",
    icon: "Gantt64"
}, {
    name: "Line Chart",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "lineChart",
    icon: "LineChart64"
}, {
    name: "Map",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "map",
    icon: "Map64"
}, {
    name: "Network Graph",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "networkGraph",
    icon: "Graph64"
}, {
    name: "Newsfeed",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "newsFeed",
    icon: "News64"
}, {
    name: "Ops Clock",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "opsClock",
    icon: "OpsClock64"
}, {
    name: "Scatter Plot",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "scatterPlot",
    icon: "ScatterPlot64"
}, {
    name: "Sunburst Chart",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "sunburstChart",
    icon: "Sunburst64"
}, {
    name: "Text Cloud",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "textCloud",
    icon: "TagCloud64"
}, {
    name: "Timeline",
    minSizePercentageX: 0.25,
    minSizePercentageY: 0.20,
    type: "timeline",
    icon: "Timeline64"
}];
