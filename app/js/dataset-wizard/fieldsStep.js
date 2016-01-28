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
angular.module('neonDemo.directives')
.directive('fieldsStep', ['ConnectionService', 'ErrorNotificationService',
    function(connectionService, errorNotificationService) {
    return {
        templateUrl: 'partials/dataset-wizard/fieldsStep.html',
        restrict: 'E',
        require: '^wizard',
        scope: {
            stepNumber: '='
        },
        link: function($scope, $element, $attrs, wizardCtrl) {
            $scope.isSelected = false;
            $scope.customDatabases = [];
            $scope.isLoading = false;
            $scope.fieldTypes = [];
            $scope.datastore = {};
            $scope.databaseMappings = {};
            $scope.mappingOptions = [
                {
                    name: "count_by",
                    prettyName: "Aggregation Table Field"
                },{
                    name: "bar_x_axis",
                    prettyName: "Bar Chart X-Axis"
                },{
                    name: "date",
                    prettyName: "Date"
                },{
                    name: "latitude",
                    prettyName: "Latitude"
                },{
                    name: "line_category",
                    prettyName: "Line Chart Grouping"
                },{
                    name: "longitude",
                    prettyName: "Longitude"
                },{
                    name: "tags",
                    prettyName: "Tag Cloud Field"
                },{
                    name: "y_axis",
                    prettyName: "Y-Axis"
                }
            ];

            /**
             * Toggles the field mappings display for the given custom table.
             * @param {Object} customTable
             * @method toggleFieldMappingsDisplay
             */
            $scope.toggleFieldMappingsDisplay = function(customTable) {
                customTable.showFieldMappings = !customTable.showFieldMappings;
            };

            /**
             * Selection event for the given mapping set to the given field.
             * @param {Number} index Index of the mapping in the mapping options list.
             * @param {Object} field Field to add a mapping for.
             * @param {Object} table Table object for the given field.
             * @param {Object} database Database object for the given field.
             * @method selectMapping
             */
            $scope.selectMapping = function(index, field, table, database) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "field-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", (index === "" ? "" : $scope.mappingOptions[index].name), "mapping", field.columnName, "field"]
                });

                if(!$scope.databaseMappings[database.name]) {
                    $scope.databaseMappings[database.name] = {};
                }
                if(!$scope.databaseMappings[database.name][table.table.name]) {
                    $scope.databaseMappings[database.name][table.table.name] = {};
                }
                if($scope.databaseMappings[database.name][table.table.name][field.columnName]) {
                    var oldMapping = $scope.databaseMappings[database.name][table.table.name][field.columnName];
                    delete table[oldMapping];
                }

                if(index !== "") {
                    var mapping = $scope.mappingOptions[index].name;
                    table[mapping] = field;
                    $scope.databaseMappings[database.name][table.table.name][field.columnName] = mapping;
                } else {
                    delete $scope.databaseMappings[database.name][table.table.name][field.columnName];
                }
            };

            /**
             * Returns whether the given mapping is already selected for another field in the given database and table.
             * @param {Object} database
             * @param {Object} table
             * @param {Object} field
             * @return {Boolean}
             * @method isMappingDisabled
             */
            $scope.isMappingDisabled = function(database, table, mapping) {
                if($scope.databaseMappings[database.name] && $scope.databaseMappings[database.name][table.table.name]) {
                    return _.any($scope.databaseMappings[database.name][table.table.name], function(mappingName) {
                        return mappingName === mapping.name;
                    });
                } else {
                    return false;
                }
            };

            /**
             * Gets the field type for the given field name in the given database and table. If not found, returns 'Unknown'.
             * @param {String} databaseName
             * @param {String} tableName
             * @param {String} fieldName
             * @method getFieldType
             */
            $scope.getFieldType = function(databaseName, tableName, fieldName) {
                if($scope.fieldTypes && $scope.fieldTypes[databaseName] && $scope.fieldTypes[databaseName][tableName] &&
                    $scope.fieldTypes[databaseName][tableName][fieldName]) {
                    return $scope.fieldTypes[databaseName][tableName][fieldName];
                }
                return "Unknown";
            };

            /**
             * Retrives all field types for all database/table pairs specified in the custom database object.
             * @method loadFieldTypes
             * @private
             */
            var loadFieldTypes = function() {
                var connection = connectionService.createActiveConnection($scope.datastore.type, $scope.datastore.host);
                if(!connection) {
                    return;
                }

                $scope.isLoading = true;

                var databaseToTableNames = {};

                // Create a mapping of all the custom database names to an array of their custom table names
                _.each($scope.customDatabases, function(database) {
                    if(!databaseToTableNames[database.database.name]) {
                        databaseToTableNames[database.database.name] = [];
                    }

                    _.each(database.customTables, function(table) {
                        if(databaseToTableNames[database.database.name].indexOf(table.table.name) < 0) {
                            databaseToTableNames[database.database.name].push(table.table.name);
                        }
                    });
                });

                connection.getFieldTypesForGroup(databaseToTableNames, function(response) {
                    $scope.$apply(function() {
                        $scope.isLoading = false;
                        $scope.fieldTypes = response;
                    });
                }, function(response) {
                    $scope.isLoading = false;
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage(null, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /*
             * Returns whether she step is valid and can go on to the next step.
             * @return {Boolean}
             * @method validateStep
             * @private
             */
            var validateStep = function() {
                return true;
            };

            /*
             * Shows/hides this step.
             * @param {Boolean} selected
             * @method selected
             * @private
             */
            var selected = function(selected) {
                $scope.isSelected = selected;
            };

            /*
             * Function to call on step initialization.
             * @method init
             * @private
             */
            var init = function(databases, customDatabases, datastore) {
                $scope.customDatabases = customDatabases;
                $scope.datastore = datastore;
                $scope.isLoading = false;
                $scope.fieldTypes = [];
                $scope.databaseMappings = {};
                loadFieldTypes();
            };

            /*
             * Function to call when the step finishes.
             * @method onFinish
             * @private
             */
            var onFinish = function() {
                wizardCtrl.setCustomDatabases($scope.customDatabases);
            };

            wizardCtrl.addStep({
                title: "Set Fields Default Use",
                stepNumber: $scope.stepNumber,
                validateStep: validateStep,
                selected: selected,
                init: init,
                onFinish: onFinish
            });
        }
    };
}]);
