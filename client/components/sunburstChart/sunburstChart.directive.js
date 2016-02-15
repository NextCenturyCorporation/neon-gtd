'use strict';

/*
 * Copyright 2014 Next Century Corporation
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
 * This directive adds a D3 sunburst chart to the DOM and drives the visualization data from
 * whatever database and table are currently selected in neon.  This directive accomplishes that
 * by getting a neon connection from a connection service and listening for
 * neon system events (e.g., data tables changed).  On these events, it requeries the active
 * connection for data and updates applies the change to its scope.  The contained
 * sunburst will update as a result.
 * @namespace neonDemo.directives
 * @class sunburst
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('sunburst', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'ExportService', 'VisualizationService',
function(connectionService, datasetService, errorNotificationService, exportService, visualizationService) {
    return {
        templateUrl: 'components/sunburstChart/sunburstChart.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindTable: '=',
            bindDatabase: '=',
            bindGroupFields: '=',
            bindValueField: '=',
            bindArcValue: '=',
            bindFilterField: '=',
            bindFilterValue: '=',
            bindStateId: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('sunburst-directive');

            $scope.element = $element;

            $scope.arcValue = "count";
            $scope.groupFields = [];
            $scope.messenger = new neon.eventing.Messenger();

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.chart = undefined;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.outstandingQuery = undefined;

            $scope.options = {
                database: {},
                table: {},
                selectedItem: "",
                valueField: "",
                filterField: {}
            };

            var initialize = function() {
                $scope.chart = new charts.SunburstChart($element[0], '.sunburst-chart', {
                    height: "100%",
                    width: "100%"
                });
                $scope.chart.drawBlank();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    queryForData();
                });

                $scope.exportID = exportService.register($scope.makeSunburstExportObject);
                visualizationService.register($scope.bindStateId, bindFields);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "sunburst",
                        elementType: "canvas",
                        elementSub: "sunburst",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["remove", "sunburst"]
                    });
                    $element.off("resize", updateChartSize);
                    $scope.messenger.unsubscribeAll();
                    exportService.unregister($scope.exportID);
                    visualizationService.unregister($scope.bindStateId);
                });

                // This resizes the chart when the div changes.  This rely's on jquery's resize plugin to fire
                // on the associated element and not just the window.
                $element.resize(updateChartSize);

                $scope.$watch('options.valueField', function(newValue, oldValue) {
                    if(!$scope.loadingData && newValue !== oldValue) {
                        if(newValue) {
                            queryForData();
                        } else {
                            $scope.options.valueField = datasetService.createBlankField();
                            $scope.arcValue = charts.SunburstChart.COUNT_PARTITION;
                        }
                    }
                }, true);

                $scope.$watch('arcValue', function(newValue, oldValue) {
                    if(!$scope.loadingData && newValue !== oldValue) {
                        $scope.chart.displayPartition(newValue);
                    }
                });
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "query",
                        elementId: "sunburst",
                        elementType: "canvas",
                        elementSub: "sunburst",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["filter-change", "sunburst"]
                    });
                    queryForData();
                }
            };

            var updateChartSize = function() {
                // Set the width of the title to the width of the visualization minus the width of the chart options button/text and padding.
                var titleWidth = $element.width() - $element.find(".chart-options").outerWidth(true) - 20;
                $element.find(".title").css("maxWidth", titleWidth);

                if($scope.chart) {
                    var headerHeight = 0;
                    $element.find(".header-container").each(function() {
                        headerHeight += $(this).outerHeight(true);
                    });
                    $element.find('.sunburst-chart').height($element.height() - headerHeight);
                }
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             * @private
             */
            var buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name);
                if($scope.groupFields.length > 0) {
                    query.groupBy.apply(query, $scope.groupFields);
                }

                //take based on selected count or total
                query.aggregate(neon.query.COUNT, '*', 'count');
                if(datasetService.isFieldValid($scope.options.valueField)) {
                    query.aggregate(neon.query.SUM, $scope.options.valueField.columnName, $scope.options.valueField.prettyName);
                }

                if(datasetService.isFieldValid($scope.options.filterField) && $scope.options.filterValue) {
                    var operator = "contains";
                    var value = $scope.options.filterValue;
                    if($.isNumeric(value)) {
                        operator = "=";
                        value = parseFloat(value);
                    }
                    query.where($scope.options.filterField.columnName, operator, value);
                }

                return query;
            };

            /**
             * Displays data for any currently active datasets.
             * @method displayActiveDataset
             * @private
             */
            var displayActiveDataset = function() {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();
                $scope.options.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.options.database = $scope.databases[i];
                            break;
                        }
                    }
                }
                $scope.updateTables();
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.options.table = $scope.tables[i];
                            break;
                        }
                    }
                }
                $scope.updateFields();
            };

            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);

                $scope.groupFields = [];
                if($scope.bindGroupFields) {
                    _.each($scope.bindGroupFields.split(","), function(groupFieldName) {
                        var groupFieldObject = _.find($scope.fields, function(field) {
                            return field.columnName === groupFieldName;
                        });
                        if(groupFieldObject) {
                            $scope.groupFields.push(groupFieldObject);
                        }
                    });
                }

                $scope.options.valueField = $scope.bindValueField ? _.find($scope.fields, function(field) {
                    return field.columnName === $scope.bindValueField;
                }) || datasetService.createBlankField() : datasetService.createBlankField();
                $scope.arcValue = $scope.bindArcValue ? $scope.bindArcValue : charts.SunburstChart.COUNT_PARTITION;
                var filterFieldName = $scope.bindFilterField || "";
                $scope.options.filterField = _.find($scope.fields, function(field) {
                    return field.columnName === filterFieldName;
                }) || datasetService.createBlankField();
                $scope.options.filterValue = $scope.bindFilterValue || "";

                queryForData();
            };

            var queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                // Save the title during the query so the title doesn't change immediately if the user changes the unshared filter.
                $scope.queryTitle = $scope.generateTitle(true);

                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    doDrawChart(buildDataTree({
                        data: []
                    }));
                    $scope.loadingData = false;
                    return;
                }

                var query = buildQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "sunburst",
                    elementType: "canvas",
                    elementSub: "sunburst",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "sunburst"]
                });

                if($scope.outstandingQuery) {
                    $scope.outstandingQuery.abort();
                }

                $scope.outstandingQuery = connection.executeQuery(query);
                $scope.outstandingQuery.done(function() {
                    $scope.outstandingQuery = undefined;
                });
                $scope.outstandingQuery.done(function(queryResults) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: "sunburst",
                        elementType: "canvas",
                        elementSub: "sunburst",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["receive", "sunburst"]
                    });
                    $scope.$apply(function() {
                        updateChartSize();
                        doDrawChart(buildDataTree(queryResults));
                        $scope.loadingData = false;
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "render",
                            elementId: "sunburst",
                            elementType: "canvas",
                            elementSub: "sunburst",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["render", "sunburst"]
                        });
                    });
                });
                $scope.outstandingQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "sunburst",
                            elementType: "canvas",
                            elementSub: "sunburst",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["canceled", "sunburst"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "sunburst",
                            elementType: "canvas",
                            elementSub: "sunburst",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["failed", "sunburst"]
                        });
                        doDrawChart(buildDataTree({
                            data: []
                        }));
                        $scope.loadingData = false;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    }
                });
            };

            var buildDataTree = function(data) {
                var nodes = {};
                var tree = {
                    name: $scope.options.table.name,
                    prettyName: $scope.options.table.name,
                    key: $scope.options.table.name,
                    children: []
                };
                var leafObject;
                var nodeObject;
                var nodeKey;
                var nodeKeyString;

                var field;
                var prettyField;

                var i;
                data.data.forEach(function(doc) {
                    var parent = tree;
                    leafObject = {};
                    nodeKey = {};
                    for(i = 0; i < $scope.groupFields.length; i++) {
                        field = $scope.groupFields[i].columnName;
                        prettyField = $scope.groupFields[i].prettyName;

                        leafObject[field] = doc[field];
                        nodeKey[field] = doc[field];
                        nodeKey.name = field + ": " + doc[field];
                        nodeKey.prettyName = (prettyField ? prettyField : field) + ": " + doc[field];
                        nodeKeyString = JSON.stringify(nodeKey);

                        if(!nodes[nodeKeyString]) {
                            if(i !== $scope.groupFields.length - 1) {
                                nodeObject = {};
                                nodeObject.name = field + ": " + doc[field];
                                nodeObject.prettyName = prettyField + ": " + doc[field];
                                nodeObject.key = nodeKeyString;
                                nodeObject.children = [];
                                parent.children.push(nodeObject);
                                parent = nodeObject;
                                nodes[nodeKeyString] = nodeObject;
                            } else {
                                leafObject.name = field + ": " + doc[field];
                                leafObject.prettyName = prettyField + ": " + doc[field];
                                leafObject.count = doc.count;
                                leafObject.total = doc[$scope.options.valueField.prettyName];
                                leafObject.key = nodeKeyString;
                                parent.children.push(leafObject);
                            }
                        } else {
                            parent = nodes[nodeKeyString];
                        }
                    }
                });

                return tree;
            };

            var doDrawChart = function(data) {
                data = neon.helpers.escapeDataRecursively(data);
                $scope.chart.clearData();
                $scope.dataShown = $scope.chart.drawData(data);
            };

            $scope.showChart = function() {
                $scope.dataShown = true;
            };

            $scope.addGroup = function() {
                if($scope.groupFields.indexOf($scope.options.selectedItem) === -1 && $scope.options.selectedItem.columnName !== "") {
                    $scope.groupFields.push($scope.options.selectedItem);
                }
                $scope.options.selectedItem = {};
                queryForData();
            };

            $scope.dropGroup = function(groupField) {
                var index = $scope.groupFields.indexOf(groupField);
                if(index !== -1) {
                    $scope.groupFields.splice(index, 1);
                }
                queryForData();
            };

            $scope.handleChangeUnsharedFilterField = function() {
                // TODO Logging
                $scope.options.filterValue = "";
            };

            $scope.handleChangeUnsharedFilterValue = function() {
                // TODO Logging
                if(!$scope.loadingData) {
                    queryForData();
                }
            };

            $scope.handleRemoveUnsharedFilter = function() {
                // TODO Logging
                $scope.options.filterValue = "";
                if(!$scope.loadingData) {
                    queryForData();
                }
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeSunburstExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "sunburst-export",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["options", "sunburst", "export"]
                });
                var query = buildQuery();
                query.limitClause = exportService.getLimitClause();
                // Sort results by each group field so the resulting file won't be ugly.
                var sortByArgs = [];
                $scope.groupFields.forEach(function(field) {
                    sortByArgs.push(field.prettyName);
                    sortByArgs.push(neon.query.ASCENDING);
                });
                query.sortBy(sortByArgs);

                var finalObject = {
                    name: "Sunburst",
                    data: [{
                        query: query,
                        name: "sunburst-" + $scope.exportID,
                        fields: [],
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                $scope.groupFields.forEach(function(field) {
                    finalObject.data[0].fields.push({
                        query: field.columnName,
                        pretty: field.prettyName
                    });
                });
                return finalObject;
            };

            /**
             * Creates and returns an object that contains all the binding fields needed to recreate the visualization's state.
             * @return {Object}
             * @method bindFields
             * @private
             */
            var bindFields = function() {
                var bindingFields = {};
                bindingFields["bind-title"] = $scope.bindTitle ? "'" + $scope.bindTitle + "'" : undefined;
                bindingFields["bind-table"] = ($scope.options.table && $scope.options.table.name) ? "'" + $scope.options.table.name + "'" : undefined;
                bindingFields["bind-database"] = ($scope.options.database && $scope.options.database.name) ? "'" + $scope.options.database.name + "'" : undefined;
                bindingFields["bind-group-fields"] = $scope.groupFields.length ? "'" + _.map($scope.groupFields, function(field) {
                    return field.columnName;
                }).join(",") + "'" : undefined;
                bindingFields["bind-value-field"] = ($scope.options.valueField && $scope.options.valueField.columnName) ? "'" + $scope.options.valueField.columnName + "'" : undefined;
                bindingFields["bind-arc-value"] = ($scope.arcValue) ? "'" + $scope.arcValue + "'" : undefined;
                bindingFields["bind-filter-field"] = ($scope.options.filterField && $scope.options.filterField.columnName) ? "'" + $scope.options.filterField.columnName + "'" : undefined;
                var hasFilterValue = $scope.options.filterField && $scope.options.filterField.columnName && $scope.options.filterValue;
                bindingFields["bind-filter-value"] = hasFilterValue ? "'" + $scope.options.filterValue + "'" : undefined;
                return bindingFields;
            };

            /**
             * Generates and returns the title for this visualization.
             * @param {Boolean} resetQueryTitle
             * @method generateTitle
             * @return {String}
             */
            $scope.generateTitle = function(resetQueryTitle) {
                if(resetQueryTitle) {
                    $scope.queryTitle = "";
                }
                if($scope.queryTitle) {
                    return $scope.queryTitle;
                }
                var title = $scope.options.filterValue ? $scope.options.filterValue + " " : "";
                if($scope.bindTitle) {
                    return title + $scope.bindTitle;
                }
                if(_.keys($scope.options).length) {
                    return title + $scope.options.table.prettyName;
                }
                return title;
            };


            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                displayActiveDataset();
            });
        }
    };
}]);
