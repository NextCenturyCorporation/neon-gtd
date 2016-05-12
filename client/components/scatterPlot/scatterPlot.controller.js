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
    $scope.data = [];
    $scope.pointCount = 0;

    $scope.active.type = $scope.bindings.type;
    $scope.active.limit = $scope.bindings.limit;

    // TODO Add scattergl once bugs are fixed in the plotly library.
    if($scope.active.type !== "scatter" && $scope.active.type !== "heatmapScatter" && $scope.active.type !== "histogramScatter") {
        $scope.active.type = "scatter";
    }

    $scope.functions.onInit = function() {
        $scope.graph = $scope.functions.getElement(".graph-div");
        $scope.graph.bind('plotly_relayout', updateFilter);
        $scope.graph.bind('plotly_filter_box', updateFilter);
    };

    $scope.functions.onUpdateFields = function() {
        $scope.active.xAxisField = $scope.functions.findFieldObject("xAxisField", neonMappings.SCATTERPLOT_X_AXIS);
        $scope.active.yAxisField = $scope.functions.findFieldObject("yAxisField", neonMappings.SCATTERPLOT_Y_AXIS);
        $scope.active.textField = $scope.functions.findFieldObject("textField");
    };

    $scope.functions.areDataFieldsValid = function() {
        return $scope.functions.isFieldValid($scope.active.xAxisField) && $scope.functions.isFieldValid($scope.active.yAxisField);
    };

    $scope.functions.addToQuery = function(query, unsharedFilterWhereClause) {
        var whereClause = neon.query.where($scope.active.xAxisField.columnName, "!=", null);
        query.where(unsharedFilterWhereClause ? neon.query.and(whereClause, unsharedFilterWhereClause) : whereClause);

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

    $scope.functions.updateData = function(data) {
        $scope.data = data || [];
        if($scope.data.length) {
            drawGraph();
        }
    };

    var drawGraph = function() {
        if(!$scope.data.length) {
            if($scope.graph) {
                $scope.graph.empty();
            }
            return;
        }

        var dataObject = buildDataConfig($scope.data);
        var layout = buildGraphLayout();
        //This can be swapped out with Plotly.deleteTrace and Plotly.plot if we add a way to track traces.
        $scope.graph.empty();
        Plotly.newPlot($scope.graph[0], [dataObject], layout);
    };

    var buildDataConfig = function(data) {
        if($scope.active.type === 'histogramScatter') {
            return buildHistogramHybridConfig(data);
        }

        if($scope.active.type === 'heatmapScatter') {
            return buildHeatmapHybridConfig(data);
        }

        return buildScatterConfig(data);
    };

    var buildScatterConfig = function(data) {
        var xArray = [];
        var yArray = [];
        var textArray = [];

        var fields = [$scope.active.xAxisField.columnName, $scope.active.yAxisField.columnName];
        if($scope.functions.isFieldValid($scope.active.textField)) {
            fields.push($scope.active.textField.columnName);
        }

        data.forEach(function(item) {
            neon.helpers.getNestedValues(item, fields).forEach(function(pointValue) {
                xArray.push(pointValue[$scope.active.xAxisField.columnName]);
                yArray.push(pointValue[$scope.active.yAxisField.columnName]);
                if($scope.functions.isFieldValid($scope.active.textField)) {
                    var textValue = pointValue[$scope.active.textField.columnName] || "";
                    textArray.push(textValue.length > 50 ? textValue.substring(0, 50) + "..." : textValue);
                }
            });
        });

        $scope.pointCount = xArray.length;

        return {
            x: xArray,
            y: yArray,
            hoverinfo: 'text',
            mode: ($scope.bindings.subType || 'markers'),
            text: textArray.length > 0 ? textArray : undefined,
            type: 'scatter'
        };
    };

    var buildHybridConfig = function(data) {
        var config = buildScatterConfig(data);
        config.hoverinfo = 'z';
        config.mode = undefined;
        config.type = undefined;
        config.showscale = true;
        return config;
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

    var buildGraphLayout = function() {
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
                title: $scope.active.xAxisField.prettyName,
                showgrid: false,
                zeroline: false
            },
            yaxis: {
                title: $scope.active.yAxisField.prettyName,
                showgrid: false,
                zeroline: false
            }
        };

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

    var updateFilter = function(event, focus) {
        $scope.focus = focus;
        if(focus['xaxis.autorange'] && focus['yaxis.autorange']) {
            $scope.functions.removeNeonFilter();
        } else {
            $scope.functions.updateNeonFilter();
        }
    };

    $scope.functions.getFilterFields = function() {
        return [$scope.active.xAxisField, $scope.active.yAxisField];
    };

    $scope.functions.updateFilterValues = function() {
        // TODO NEON-1939
    };

    $scope.functions.removeFilterValues = function() {
        $scope.focus = [];
        // TODO NEON-1939
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldNames) {
        var xAxisFieldName = fieldNames[0];
        var yAxisFieldName = fieldNames[1];

        var filterClauses = [neon.query.where(xAxisFieldName, '!=', null)];

        if($scope.focus.x && $scope.focus.y) {
            filterClauses.push(neon.query.where(xAxisFieldName, '>', $scope.focus.x[0]));
            filterClauses.push(neon.query.where(xAxisFieldName, '<', $scope.focus.x[1]));
            filterClauses.push(neon.query.where(yAxisFieldName, '>', $scope.focus.y[0]));
            filterClauses.push(neon.query.where(yAxisFieldName, '<', $scope.focus.y[1]));
        } else {
            if($scope.focus['xaxis.range']) {
                filterClauses.push(neon.query.where(xAxisFieldName, '>', $scope.focus['xaxis.range'][0]));
                filterClauses.push(neon.query.where(xAxisFieldName, '<', $scope.focus['xaxis.range'][1]));
            }

            if($scope.focus['yaxis.range']) {
                filterClauses.push(neon.query.where(yAxisFieldName, '>', $scope.focus['yaxis.range'][0]));
                filterClauses.push(neon.query.where(yAxisFieldName, '<', $scope.focus['yaxis.range'][1]));
            }

            if($scope.focus['xaxis.range[0]']) {
                filterClauses.push(neon.query.where(xAxisFieldName, '>', $scope.focus['xaxis.range[0]']));
                filterClauses.push(neon.query.where(xAxisFieldName, '<', $scope.focus['xaxis.range[1]']));
            }

            if($scope.focus['yaxis.range[0]']) {
                filterClauses.push(neon.query.where(yAxisFieldName, '>', $scope.focus['yaxis.range[0]']));
                filterClauses.push(neon.query.where(yAxisFieldName, '<', $scope.focus['yaxis.range[1]']));
            }
        }

        return neon.query.and.apply(neon.query, filterClauses);
    };

    $scope.functions.createFilterTrayText = function() {
        return $scope.active.xAxisField.columnName + " and " + $scope.active.yAxisField.columnName;
    };

    $scope.functions.shouldQueryAfterFilter = function() {
        return true;
    };

    $scope.functions.onResize = function() {
        drawGraph();
    };

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
        $scope.functions.logChangeAndUpdate("textField", $scope.active.textField ? $scope.active.textField.columnName : undefined);
    };

    $scope.handleChangeType = function() {
        // TODO Logging
        drawGraph();
    };

    $scope.handleChangeLimit = function() {
        $scope.functions.logChangeAndUpdate("limit", $scope.active.limit, "button");
    };

    $scope.functions.createMenuText = function() {
        return ($scope.pointCount || "No") + " Point" + ($scope.pointCount === 1 ? "" : "s");
    };

    $scope.functions.showMenuText = function() {
        return true;
    };
}]);
