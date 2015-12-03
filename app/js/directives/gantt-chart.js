'use strict';

/*
 * Copyright 2015 Next Century Corporation
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

angular.module('neonDemo.directives')
.directive('ganttChart', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService',
function(connectionService, datasetService, errorNotificationService, filterService) {
    return {
        templateUrl: 'partials/directives/gantt-chart.html',
        restrict: 'EA',
        scope: {
            bindRowTitleField: "=",
            bindStartField: "=",
            bindEndField: "=",
            bindColorField: "=",
            bindGroupFields: "=",
            bindSelectedGroups: "="
        },
        link: function($scope, $element) {
            $element.addClass('gantt-chart-directive');

            $scope.element = $element;

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.legend = {};
            $scope.filterKeys = filterService.createFilterKeys("gantt-chart", datasetService.getDatabaseAndTableNames());
            $scope.filterSet = {};
            $scope.helpers = neon.helpers;

            $scope.options = {
                database: {},
                table: {},
                titleField: {},
                startField: {},
                endField: {},
                colorField: {},
                newGroupField: {},
                groupFields: [],
                selectableGroups: [],
                selectedGroups: [],
                selectedGroup: ""
            };

            $scope.registerHooks = function(ganttApi) {
                ganttApi.directives.on.new($scope, function(dName, dScope, dElement) {
                    if(dName === "ganttTaskContent") {
                        dElement.attr('data-id', dScope.task.model.id);
                        dElement.bind('click', function(event) {
                            var clickedElement = $(event.currentTarget);
                            $scope.filterById(clickedElement.attr('data-id'));
                        });
                    }
                });
            };

            $scope.filterById = function(id) {
                var connection = connectionService.getActiveConnection();
                if($scope.messenger && connection) {
                    var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, ['_id']);
                    filterService.addFilters($scope.messenger, relations, $scope.filterKeys, function() {
                        return neon.query.where('_id', '=', id);
                    }, "Gantt Chart", function() {
                        $scope.filterSet.key = "_id";
                        $scope.filterSet.value = id;
                        $scope.queryForData(true);
                    });
                }
            };

            $scope.removeFilter = function() {
                filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                    $scope.filterSet = {};
                    $scope.queryForData(true);
                });
            };

            var initialize = function() {
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "count-by",
                        elementType: "datagrid",
                        elementSub: "count-by",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["remove", "count-by"]
                    });
                    $scope.messenger.removeEvents();
                    if($scope.filterSet) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                });
            };

            var onFiltersChanged = function() {
                $scope.queryForData();
            };

            $scope.displayActiveDataset = function(initializing) {
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

                if(initializing) {
                    $scope.updateTables();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTables();
                    });
                }
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

                var startField = $scope.bindStartField || "Start";
                $scope.options.startField = _.find($scope.fields, function(field) {
                    return field.columnName === startField;
                }) || datasetService.createBlankField();
                var endField = $scope.bindEndField || "End";
                $scope.options.endField = _.find($scope.fields, function(field) {
                    return field.columnName === endField;
                }) || datasetService.createBlankField();
                var colorField = $scope.bindColorField || "";
                $scope.options.colorField = _.find($scope.fields, function(field) {
                    return field.columnName === colorField;
                }) || datasetService.createBlankField();
                var titleField = $scope.bindRowTitleField || "";
                $scope.options.titleField = _.find($scope.fields, function(field) {
                    return field.columnName === titleField;
                }) || datasetService.createBlankField();

                $scope.options.groupFields = [];
                if($scope.bindGroupFields) {
                    var groupFieldNames = $scope.bindGroupFields.split(",");
                    groupFieldNames.forEach(function(groupFieldName) {
                        var groupFieldObject = _.find($scope.fields, function(field) {
                            return field.columnName === groupFieldName;
                        });
                        if(groupFieldObject) {
                            $scope.options.groupFields.push(groupFieldObject);
                        }
                    });
                }

                $scope.options.selectableGroups = [];
                $scope.options.selectedGroups = $scope.bindSelectedGroups ? $scope.bindSelectedGroups.split(",") : [];

                $scope.queryForData();
            };

            $scope.queryForData = function(ignoreGroupQuery) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                $scope.legend.colors = [];

                var connection = connectionService.getActiveConnection();

                if(!connection || !datasetService.isFieldValid($scope.options.startField) || !datasetService.isFieldValid($scope.options.endField)) {
                    createGanttChart([]);
                    $scope.loadingData = false;
                    return;
                }

                if(!ignoreGroupQuery && $scope.options.groupFields.length && datasetService.isFieldValid($scope.options.groupFields[0])) {
                    var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name)
                        .groupBy($scope.options.groupFields[0])
                        .aggregate(neon.query.COUNT, "*", "count")
                        .sortBy("count", neon.query.DESCENDING)
                        .ignoreFilters([$scope.filterKeys[$scope.options.database.name][$scope.options.table.name]]);

                    connection.executeQuery(query, function(queryResults) {
                        $scope.$apply(function() {
                            $scope.options.selectableGroups = queryResults.data.map(function(item) {
                                return $scope.helpers.getNestedValue(item, $scope.options.groupFields[0].columnName);
                            }) || [];
                        });
                        queryForGanttChartData(connection);
                    }, function(response) {
                        $scope.$apply(function() {
                            $scope.options.selectableGroups = [];
                        });
                        queryForGanttChartData(connection);
                    });
                } else {
                    queryForGanttChartData(connection);
                }
            };

            var queryForGanttChartData = function(connection) {
                var query = buildQuery();

                connection.executeQuery(query, function(queryResults) {
                    $scope.$apply(function() {
                        createGanttChart(queryResults.data);
                        $scope.loadingData = false;
                        if($scope.options.groupFields.length) {
                            $element.find(".gantt-side").width(200);
                        }
                    });
                }, function(response) {
                    createGanttChart([]);
                    $scope.loadingData = false;

                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            var buildQuery = function() {
                var fields = [$scope.options.startField.columnName, $scope.options.endField.columnName];
                if(datasetService.isFieldValid($scope.options.colorField)) {
                    fields.push($scope.options.colorField.columnName);
                }
                if(datasetService.isFieldValid($scope.options.titleField)) {
                    fields.push($scope.options.titleField.columnName);
                }
                $scope.options.groupFields.forEach(function(groupField) {
                    fields.push(groupField.columnName);
                });
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).withFields(fields);

                if($scope.options.groupFields.length && datasetService.isFieldValid($scope.options.groupFields[0])) {
                    var whereClauses = $scope.options.selectedGroups.map(function(group) {
                        return neon.query.where($scope.options.groupFields[0].columnName, "=", group);
                    }) || [];
                    if(whereClauses.length) {
                        query.where(whereClauses.length === 1 ? whereClauses[0] : neon.query.or.apply(neon.query, whereClauses));
                    }
                }
                return query;
            };

            var createGanttChart = function(data) {
                var colorScale = d3.scale.ordinal().range(neonColors.LIST);
                var colors = [];

                var groupsToColors = {};

                if(datasetService.isFieldValid($scope.options.colorField)) {
                    groupsToColors = datasetService.getActiveDatasetColorMaps($scope.options.database.name, $scope.options.table.name, $scope.options.colorField.columnName);
                    if(Object.keys(groupsToColors).length) {
                        Object.keys(groupsToColors).forEach(function(group) {
                            $scope.legend.colors.push({
                                color: groupsToColors[group],
                                text: group
                            });
                        });
                    } else {
                        colors = createFieldValueList($scope.options.colorField.columnName, data);
                        colors.forEach(function(color, index) {
                            $scope.legend.colors.push({
                                color: colorScale(index),
                                text: color
                            });
                        });
                    }
                }

                $scope.data = [];
                $scope.tree = {};
                if($scope.options.groupFields.length) {
                    buildTree(data);
                }

                data.forEach(function(item, index) {
                    var treeParent;
                    if($scope.options.groupFields.length) {
                        treeParent = getTreeParent(item);
                    } else {
                        treeParent = {
                            tasks: []
                        };
                        $scope.data.push(treeParent);
                    }

                    var color;
                    var colorFieldValue = $scope.helpers.getNestedValue(item, $scope.options.colorField.columnName);
                    if(Object.keys(groupsToColors).length) {
                        color = groupsToColors[colorFieldValue] || neonColors.DEFAULT;
                    } else if(colors.length) {
                        color = colorScale(colors.indexOf(colorFieldValue));
                    } else {
                        color = colorScale(index);
                    }

                    treeParent.tasks.push({
                        id: item._id,
                        name: datasetService.isFieldValid($scope.options.titleField) ? $scope.helpers.getNestedValue(item, $scope.options.titleField.columnName) : "",
                        from: $scope.helpers.getNestedValue(item, $scope.options.startField.columnName),
                        to: $scope.helpers.getNestedValue(item, $scope.options.endField.columnName),
                        color: color
                    });
                });

                if($scope.options.groupFields.length) {
                    Object.keys($scope.tree).forEach(function(name) {
                        saveTreeInData($scope.tree[name], name);
                    });
                }
            };

            var createFieldValueList = function(field, data) {
                var list = [];
                data.forEach(function(item) {
                    var value = $scope.helpers.getNestedValue(item, field);
                    if(list.indexOf(value) < 0) {
                        list.push(value);
                    }
                });
                return list;
            };

            var buildTree = function(data) {
                if($scope.options.groupFields.length) {
                    data.forEach(function(item) {
                        var groupValue = $scope.helpers.getNestedValue(item, $scope.options.groupFields[0].columnName);
                        $scope.tree[groupValue] = buildSubtree($scope.tree, item, 0);
                    });
                }
            };

            var buildSubtree = function(tree, item, rowIndex) {
                var fieldValue = $scope.helpers.getNestedValue(item, $scope.options.groupFields[rowIndex].columnName);
                if(rowIndex + 1 < $scope.options.groupFields.length) {
                    tree[fieldValue] = tree[fieldValue] || {};
                    tree[fieldValue][$scope.helpers.getNestedValue(item, $scope.options.groupFields[rowIndex + 1].columnName)] = buildSubtree(tree[fieldValue], item, rowIndex + 1);
                    return tree[fieldValue];
                }
                return tree[fieldValue] || {
                    tasks: []
                };
            };

            var getTreeParent = function(item) {
                var treeParent = $scope.tree;
                $scope.options.groupFields.forEach(function(groupField) {
                    treeParent = treeParent[$scope.helpers.getNestedValue(item, groupField.columnName)];
                });
                return treeParent;
            };

            var saveTreeInData = function(tree, name, parentName) {
                $scope.data.push({
                    name: name,
                    parent: parentName,
                    tasks: tree.tasks
                });
                if(!tree.tasks) {
                    Object.keys(tree).forEach(function(childName) {
                        saveTreeInData(tree[childName], childName, name);
                    });
                }
            };

            $scope.changeGroupField = function(index, field) {
                if(datasetService.isFieldValid(field)) {
                    $scope.options.groupFields[index] = field;
                } else {
                    $scope.options.groupFields.splice(index, 1);
                }
                $scope.queryForData();
            };

            $scope.addGroupField = function() {
                if(datasetService.isFieldValid($scope.options.newGroupField)) {
                    $scope.options.groupFields.push($scope.options.newGroupField);
                }
                $scope.options.newGroupField = {};
                $scope.queryForData();
            };

            $scope.selectGroup = function() {
                if($scope.options.selectableGroups.indexOf($scope.options.selectedGroup) >= 0) {
                    $scope.options.selectedGroups.push($scope.options.selectedGroup);
                    $scope.queryForData(true);
                }
                $scope.options.selectedGroup = "";
            };

            $scope.removeSelectedGroups = function() {
                $scope.options.selectedGroups = [];
                $scope.queryForData(true);
            };

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
