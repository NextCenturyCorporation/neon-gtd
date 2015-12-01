'use strict';
/*
 * Copyright 2013 Next Century Corporation
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
neonMappings.ID = "id";
neonMappings.DATE = "date";
neonMappings.TAGS = "tags";
neonMappings.URLS = "url";
neonMappings.LATITUDE = "latitude";
neonMappings.LONGITUDE = "longitude";
neonMappings.COLOR = "color_by";
neonMappings.SIZE = "size_by";
neonMappings.SORT = "sort_by";
neonMappings.AGGREGATE = "count_by";
neonMappings.Y_AXIS = "y_axis";
neonMappings.BAR_GROUPS = "bar_x_axis";
neonMappings.LINE_GROUPS = "line_category";
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
