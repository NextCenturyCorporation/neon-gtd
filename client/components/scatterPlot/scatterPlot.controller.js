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

/**
 * This visualization shows grouped or numerical data in a scatter plot.
 * @namespace neonDemo.controllers
 * @class scatterPlotController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('scatterPlotController', ['$scope', function($scope) {
    $scope.backgroundColor = "#fff";
    $scope.textColor = "#777";

    $scope.active.type = $scope.bindings.type;
    $scope.active.limit = $scope.bindings.limit;

    // Default to an SVG scatter plot if not specified.
    if($scope.active.type !== "scatter" && $scope.active.type !== "heatmapScatter" && $scope.active.type !== "histogramScatter" &&
        $scope.active.type !== "scattergl") {
        $scope.active.type = "scatter";
    }
    
    // resizing and changingType are used to track if we're in a resize action or changing between an SVG plot to a GL plot,
    // so we can prevent spurious plotly relayout events from creating filters.
    var resizing = false;   
    var changingType = false;
    var drawingGraph = false;
    var plotting = false;
    /* Tracking whether we've zoomed on a gl plot before as the event data has slightly different after zomming. */
    var hasZoomedGL = false;   
    var scatterOuterBounds = {};

    var isWithinDataBounds = function(minx, maxx, miny, maxy) {
        return ((minx > scatterOuterBounds.minx) || (miny > scatterOuterBounds.miny) ||
                (maxx < scatterOuterBounds.maxx) || (maxy < scatterOuterBounds.maxy));
    }

    var relayoutHandler = function(evt, data) {
        // Depending on the plot type and the source of the layout event, the x and y ranges can come in any of three formats.
        var bounds = {};
        var xaxis;
        var yaxis;
        var layout = $scope.graph[0].layout;

        // If we have data and we have been plotted with valid ranges, then check to see if we need to create
        // a filter for this event.
        if ($scope.data && $scope.data.length > 1 && data && layout.xaxis && layout.xaxis.range) {
            if(data['xaxis.autorange'] && $scope.functions.isFilterSet()) {
                 // With autorange enabled on our graph, reset actions have autorange fields, not axis ranges.
                $scope.functions.removeNeonFilter(false);
                hasZoomedGL = false;  // Reset our has Zoomed state when the user resets the view.
                return;
            } else if(data.xaxis && _.isArray(data.xaxis) && 
                      layout.xaxis.autorange && 
                      (!layout.autosize || isWithinDataBounds(data.xaxis[0], data.xaxis[1], data.yaxis[0], data.yaxis[1]))) {
                // webgl plots appear to seed xaxis objects in the event data.
                bounds.xaxis = data.xaxis;
                bounds.yaxis = data.yaxis;
                hasZoomedGL = true;
            } else if(data.xaxis && data.xaxis.range && !data.xaxis.autorange) {
                // webgl plots appear to seed xaxis objects in the event data.
                bounds.xaxis = data.xaxis.range;
                bounds.yaxis = data.yaxis.range;
            } else if(data['xaxis.range'] && data['yaxis.range']) {
                // svg plots set attributes on the event data object.
                bounds.xaxis = [data['xaxis.range'][0], data['xaxis.range'][1]];
                bounds.yaxis = [data['yaxis.range'][0], data['yaxis.range'][1]];
            } else if(data['xaxis.range[0]'] && data['yaxis.range[0]']) {
                // svg plots set attributes on the event data object.
                bounds.xaxis = [data['xaxis.range[0]'], data['xaxis.range[1]']];
                bounds.yaxis = [data['yaxis.range[0]'], data['yaxis.range[1]']];
            } else if ($scope.functions.isFilterSet()) {
                // Handle the case where we are switcing layer types and have an active filter alraedy.
                bounds.xaxis = $scope.graph[0].layout.xaxis;
                bounds.yaxis = $scope.graph[0].layout.yaxis;
            } 
        }

        // Create a filter based on the current zoom level if we don't already have a filter for the current zoom level.
        if(bounds.xaxis && bounds.yaxis && !resizing && !changingType && !drawingGraph && !plotting) {
            if(!$scope.filter || (!_.isEqual(bounds.xaxis, $scope.filter.xaxis) || !_.isEqual(bounds.yaxis, $scope.filter.yaxis))) {
                $scope.filter = bounds;
                $scope.functions.updateNeonFilter(false);
            }
        }
    };

    $scope.functions.onInit = function() {
        $scope.graph = $scope.functions.getElement(".graph-div");
        $scope.graph.bind('plotly_relayout', relayoutHandler);
        $scope.graph.bind('plotly_beforeplot', function(evt) {
            plotting = true;
        });
        $scope.graph.bind('plotly_afterplot', function(evt) {
            plotting = false;
        });

        Plotly.newPlot($scope.graph[0], [], {}, {
            displayModeBar: true,
            modeBarButtons: [['toImage', 'pan2d'], ['zoom2d', 'zoomIn2d', 'zoomOut2d'], ['autoScale2d']],
            scrollZoom: false
        });
    };

    $scope.functions.onUpdateFields = function() {
        $scope.active.xAxisField = $scope.functions.findFieldObject("xAxisField", neonMappings.SCATTERPLOT_X_AXIS);
        $scope.active.yAxisField = $scope.functions.findFieldObject("yAxisField", neonMappings.SCATTERPLOT_Y_AXIS);
        $scope.active.textField = $scope.functions.findFieldObject("textField");
    };

    $scope.functions.areDataFieldsValid = function() {
        return $scope.functions.isFieldValid($scope.active.xAxisField) && $scope.functions.isFieldValid($scope.active.yAxisField);
    };

    $scope.functions.createNeonQueryWhereClause = function() {
        return neon.query.where($scope.active.xAxisField.columnName, "!=", null);
    };

    $scope.functions.addToQuery = function(query) {
        var fields = [$scope.active.xAxisField.columnName, $scope.active.yAxisField.columnName];
        if($scope.functions.isFieldValid($scope.active.textField)) {
            fields.push($scope.active.textField.columnName);
        }
        query.withFields(fields);

        if($scope.active.limit) {
            query.limit($scope.active.limit);
        }

        return query;
    };

    $scope.functions.hideHeaders = function() {
        return true;
    };

    $scope.functions.updateData = function(data) {
        $scope.data = data || [];
        drawGraph();
    };

    var drawGraph = function() {
        drawingGraph = true;

        if(!$scope.data) {
            return;
        }

        var dataObject = buildDataConfig($scope.data);
        var layout = buildGraphLayout();
        if ($scope.functions.isFilterSet()) {
            layout.xaxis = $scope.graph[0].layout.xaxis;
            layout.xaxis.autorange = false;
            layout.yaxis = $scope.graph[0].layout.yaxis;
            layout.yaxis.autorange = false;
        }

        // Remove the previous plot trace if one exists.
        if($scope.graph[0].data && $scope.graph[0].data.length > 0) {
            Plotly.deleteTraces($scope.graph[0],[0]);
        }

        if(dataObject.type === "scattergl") {
            var traces = [];
            // Scattergl throws exceptions when you try plotting an empty trace.   Plot only if we have trace data.
            if(dataObject.x.length > 0 && dataObject.y.length > 0) {
                traces.push(dataObject);
                Plotly.plot($scope.graph[0], traces, layout).then(function() {
                    drawingGraph = false;
                });
            }
        } else {
            Plotly.plot($scope.graph[0], [dataObject], layout).then(function() {
                drawingGraph = false;
            });
        }
    };

    var buildDataConfig = function(data) {
        if($scope.active.type === 'histogramScatter') {
            return buildHistogramHybridConfig(data);
        } else if($scope.active.type === 'heatmapScatter') {
            return buildHeatmapHybridConfig(data);
        } else if($scope.active.type === 'scattergl') {
            return buildScatterConfig(data, true);
        }

        return buildScatterConfig(data, false);
    };

    var buildScatterConfig = function(data, enableGL) {
        var x = [];
        var y = [];
        var text = [];

        var minx = data[0] ? neon.helpers.getNestedValue(data[0], $scope.active.xAxisField.columnName) : undefined;
        var maxx = data[0] ? neon.helpers.getNestedValue(data[0], $scope.active.xAxisField.columnName) : undefined;;
        var miny = data[0] ? neon.helpers.getNestedValue(data[0], $scope.active.yAxisField.columnName) : undefined;;
        var maxy = data[0] ? neon.helpers.getNestedValue(data[0], $scope.active.yAxisField.columnName) : undefined;;

        enableGL = (enableGL !== undefined) ? enableGL : false;

        _.each(data, function(row) {
            var xValue = neon.helpers.getNestedValue(row, $scope.active.xAxisField.columnName);
            x.push(_.escape(xValue));

            if(xValue < minx) {
                minx = xValue;
            }

            if(xValue > maxx) {
                maxx = xValue;
            }

            var yValue = neon.helpers.getNestedValue(row, $scope.active.yAxisField.columnName);
            y.push(_.escape(yValue));

            if(yValue < miny) {
                miny = yValue;
            }

            if(yValue > maxy) {
                maxy = yValue;
            }

            if($scope.functions.isFieldValid($scope.active.textField)) {
                var textVal = row[$scope.active.textField.columnName] || "";
                if(textVal.length > 50) {
                    textVal = textVal.substring(0, 51) + '...';
                }

                text.push(_.escape(textVal));
            }
        });

        var dataConfig = {
            x: x,
            y: y,
            mode: ($scope.bindings.subType || 'markers'),
            type: (enableGL) ? 'scattergl' : 'scatter',
            hoverinfo: 'text'
        };

        if(text.length > 0) {
            dataConfig.text = text;
        }

        // Save the min and max values to assist with filter creation on GL scatter plots.
        scatterOuterBounds = {
            minx: minx,
            maxx: maxx,
            miny: miny,
            maxy: maxy
        }

        return dataConfig;
    };

    var buildHybridConfig = function(data) {
        var x = [];
        var y = [];

        _.each(data, function(row) {
            x.push(_.escape(neon.helpers.getNestedValue(row, $scope.active.xAxisField.columnName)));
            y.push(_.escape(neon.helpers.getNestedValue(row, $scope.active.yAxisField.columnName)));
        });

        return {
            x: x,
            y: y,
            showscale: true,
            hoverinfo: 'z'
        };
    };

    var buildHistogramHybridConfig = function(data) {
        if(data.length > 20000) {
            var config = buildHybridConfig(data);
            config.colorscale = [
                [0, $scope.backgroundColor],
                [0.0001, 'rgb(0, 255, 0)'],
                [0.33, 'rgb(255, 255, 0)'],
                [1, 'rgb(255,0,0)']
            ];
            config.type = 'histogram2d';
            return config;
        }

        return buildScatterConfig(data);
    };

    var buildHeatmapHybridConfig = function(data) {
        if(data.length > 20000) {
            var config = buildHybridConfig(data);
            config.colorscale = [
                [0, $scope.backgroundColor],
                [0.0001, 'rgb(0, 255, 0)'],
                [0.2, 'rgb(255, 255, 0)'],
                [1, 'rgb(255,0,0)']
            ];
            config.type = 'histogram2dcontour';
            config.contours = {
                coloring: 'heatmap',
                showlines: false
            };
            config.line = {
                width: 0
            };
            config.ncontours = 0;
            return config;
        }

        return buildScatterConfig(data);
    };

    var buildGraphLayout = function(width, height, titleHeight) {
        var layout = {
            font: {
                color: $scope.textColor
            },
            margin: {
                l: 70,
                r: 10,
                t: 20,
                b: 60
            },
            paper_bgcolor: $scope.backgroundColor,
            plot_bgcolor: $scope.backgroundColor,
            showlegend: false,
            xaxis: {
                autotick: true,
                title: ($scope.active.xAxisField) ? $scope.active.xAxisField.prettyName : '',
                showgrid: true,
                zeroline: true
            },
            yaxis: {
                autotick: true,
                title: ($scope.active.yAxisField) ? $scope.active.yAxisField.prettyName : '',
                showgrid: true,
                zeroline: true
            }
        };

        layout.width = (width !== undefined) ? width : undefined;
        layout.height = (height !== undefined) ? height - (titleHeight || 0) : undefined;

        if($scope.active.type === 'scatter' || $scope.active.type === 'scattergl') {
            layout = buildScatterLayout(layout);
        } else if($scope.active.type === 'histogramScatter' || $scope.active.type === 'heatmapScatter') {
            layout = buildHybridLayout(layout);
        }

        return layout;
    };

    var buildScatterLayout = function(layout) {
        layout.xaxis.side = "bottom";
        layout.yaxis.side = "left";
        return layout;
    };

    var buildHybridLayout = function(layout) {
        layout.hovermode = "closest";
        return layout;
    };

    $scope.functions.isFilterSet = function() {
        return $scope.filter;
    };

    $scope.functions.getFilterFields = function() {
        return [$scope.active.xAxisField, $scope.active.yAxisField];
    };

    $scope.functions.updateFilterValues = function(neonFilter) {
        // TODO NEON-1939
        console.log("in updateFilterValues");
        if($scope.functions.getNumberOfFilterClauses(neonFilter) === 4) {
            //$scope.filter = neonFilter.filter.whereClause.rhs;
            console.log("update the filter for scatter");
            // $scope.filter may be the filter.
        }
    };

    $scope.functions.removeFilterValues = function() {
        // TODO NEON-1939
        // Ditch the filter
        // Reset the display (zoom all the way out)
        console.log("removing filter");
        $scope.filter = undefined;
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldNames) {
        var xAxisFieldName = fieldNames[0];
        var yAxisFieldName = fieldNames[1];

        var filterClauses = [neon.query.where(xAxisFieldName, '!=', null)];

        if($scope.filter.xaxis && $scope.filter.yaxis) {
            if ($scope.filter.xaxis.range && $scope.yaxis.range) {
                filterClauses.push(neon.query.where(xAxisFieldName, '>', $scope.filter.xaxis.range[0]));
                filterClauses.push(neon.query.where(xAxisFieldName, '<', $scope.filter.xaxis.range[1]));
                filterClauses.push(neon.query.where(yAxisFieldName, '>', $scope.filter.yaxis.range[0]));
                filterClauses.push(neon.query.where(yAxisFieldName, '<', $scope.filter.yaxis.range[1]));
            } else {
                filterClauses.push(neon.query.where(xAxisFieldName, '>', $scope.filter.xaxis[0]));
                filterClauses.push(neon.query.where(xAxisFieldName, '<', $scope.filter.xaxis[1]));
                filterClauses.push(neon.query.where(yAxisFieldName, '>', $scope.filter.yaxis[0]));
                filterClauses.push(neon.query.where(yAxisFieldName, '<', $scope.filter.yaxis[1]));
            }  
        } else {
            if($scope.filter['xaxis.range']) {
                filterClauses.push(neon.query.where(xAxisFieldName, '>', $scope.filter['xaxis.range'][0]));
                filterClauses.push(neon.query.where(xAxisFieldName, '<', $scope.filter['xaxis.range'][1]));
            }

            if($scope.filter['yaxis.range']) {
                filterClauses.push(neon.query.where(yAxisFieldName, '>', $scope.filter['yaxis.range'][0]));
                filterClauses.push(neon.query.where(yAxisFieldName, '<', $scope.filter['yaxis.range'][1]));
            }

            if($scope.filter['xaxis.range[0]']) {
                filterClauses.push(neon.query.where(xAxisFieldName, '>', $scope.filter['xaxis.range[0]']));
                filterClauses.push(neon.query.where(xAxisFieldName, '<', $scope.filter['xaxis.range[1]']));
            }

            if($scope.filter['yaxis.range[0]']) {
                filterClauses.push(neon.query.where(yAxisFieldName, '>', $scope.filter['yaxis.range[0]']));
                filterClauses.push(neon.query.where(yAxisFieldName, '<', $scope.filter['yaxis.range[1]']));
            }
        }

        return neon.query.and.apply(neon.query, filterClauses);
    };

    $scope.functions.createFilterTrayText = function() {
        return $scope.active.xAxisField.columnName + " and " + $scope.active.yAxisField.columnName;
    };

    $scope.functions.shouldQueryAfterFilter = function() {
        return false;
    };

    // Override the default onresize handler.  Use debounce to prevent excessive calls to the graph
    // layout functions.
    $scope.functions.onResize = _.debounce(function(height, width, titleHeight) {
        if($scope.graph) {
            resizing = true;
            Plotly.relayout($scope.graph[0], buildGraphLayout(width, height, titleHeight));
            resizing = false;
        }
    }, 500);

    $scope.functions.onThemeChanged = function(theme) {
        if(theme.backgroundColor !== $scope.backgroundColor || theme.textColor !== $scope.textColor) {
            $scope.backgroundColor = theme.backgroundColor;
            $scope.textColor = theme.textColor;
            drawGraph();
            return true;
        }
        return false;
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.type = $scope.active.type || undefined;
        bindings.subType = $scope.bindings.subType || undefined;
        bindings.limit = $scope.active.limit || undefined;
        bindings.xAxisField = $scope.functions.isFieldValid($scope.active.xAxisField) ? $scope.active.xAxisField.columnName : undefined;
        bindings.yAxisField = $scope.functions.isFieldValid($scope.active.yAxisField) ? $scope.active.yAxisField.columnName : undefined;
        return bindings;
    };

    $scope.handleChangeXAxisField = function() {
        $scope.functions.logChangeAndUpdate("xAxisField", $scope.active.xAxisField.columnName);
    };

    $scope.handleChangeYAxisField = function() {
        $scope.functions.logChangeAndUpdate("yAxisField", $scope.active.yAxisField.columnName);
    };

    $scope.handleChangeTextField = function() {
        $scope.functions.logChangeAndUpdate("textField", $scope.active.textField.columnName);
    };

    $scope.handleChangeType = function() {
        changingType = true;
        drawGraph();
        changingType = false;
    };

    $scope.handleChangeLimit = function() {
        $scope.functions.logChangeAndUpdate("limit", $scope.active.limit, "button");
    };
}]);
