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

angular.module('neonDemo.controllers').controller('opsClockController', ['$scope', function($scope) {
    $scope.active.dateField = {};
    $scope.active.maxDay = "";
    $scope.active.maxTime = "";

    var HOURS_IN_WEEK = 168;
    var HOURS_IN_DAY = 24;

    var createDaysList = function() {
        return [{
            name: "Sundays",
            count: 0
        }, {
            name: "Mondays",
            count: 0
        }, {
            name: "Tuesdays",
            count: 0
        }, {
            name: "Wednesdays",
            count: 0
        }, {
            name: "Thursdays",
            count: 0
        }, {
            name: "Fridays",
            count: 0
        }, {
            name: "Saturdays",
            count: 0
        }];
    };

    var createTimesList = function() {
        return [{
            name: "Mornings",
            count: 0
        }, {
            name: "Afternoons",
            count: 0
        }, {
            name: "Evenings",
            count: 0
        }, {
            name: "Nights",
            count: 0
        }];
    };

    var createHoursList = function() {
        var hours = [];

        for(var i = 0; i < HOURS_IN_WEEK; i++) {
            hours[i] = 0;
        }

        return hours;
    };

    $scope.functions.onInit = function() {
        // TODO The circular heat chart should be able to initialize itself without the visualization element.
        $scope.chart = new CircularHeatChart($scope.functions.getElement(".circular-heat-chart")[0])
            // TODO Move these settings to the circular heat chart.
            .segmentHeight(20)
            .innerRadius(20)
            .numSegments(24)
            .radialLabels(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])
            .segmentLabels(["12am", "1am", "2am", "3am", "4am", "5am", "6am", "7am", "8am", "9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm", "9pm", "10pm", "11pm"])
            .margin({
                top: 20,
                right: 20,
                bottom: 20,
                left: 20
            });

        $scope.chart.render(createHoursList());
    };

    $scope.functions.onUpdateFields = function() {
        $scope.active.dateField = $scope.functions.findFieldObject("dateField", neonMappings.DATE);
    };

    $scope.functions.areDataFieldsValid = function() {
        return $scope.functions.isFieldValid($scope.active.dateField);
    };

    $scope.functions.createNeonQueryWhereClause = function() {
        return neon.query.and(
            neon.query.where($scope.active.dateField.columnName, '>=', new Date("1970-01-01T00:00:00.000Z")),
            neon.query.where($scope.active.dateField.columnName, '<=', new Date("2025-01-01T00:00:00.000Z"))
        );
    };

    $scope.functions.addToQuery = function(query) {
        //TODO: NEON-603 Add support for dayOfWeek to query API
        query.groupBy(new neon.query.GroupByFunctionClause('dayOfWeek', $scope.active.dateField.columnName, 'day'),
                new neon.query.GroupByFunctionClause(neon.query.HOUR, $scope.active.dateField.columnName, 'hour'));

        query.aggregate(neon.query.COUNT, '*', 'count');

        return query;
    };

    $scope.functions.updateData = function(data) {
        var hours = createHoursList();
        var days = createDaysList();
        var times = createTimesList();

        data.forEach(function(item) {
            hours[(item.day - 1) * HOURS_IN_DAY + item.hour] = item.count;

            // Add count to total for this day of the week.
            days[item.day - 1].count += item.count;

            // Add count to total for this time of day.
            if(item.hour >= 5 && item.hour < 12) {
                times[0].count += item.count;
            } else if(item.hour >= 12 && item.hour < 17) {
                times[1].count += item.count;
            } else if(item.hour >= 17 && item.hour < 21) {
                times[2].count += item.count;
            } else {
                times[3].count += item.count;
            }
        });

        $scope.active.maxDay = "";
        $scope.active.maxTime = "";

        // Find the day with the highest count.
        var maxCount = 0;
        days.forEach(function(day) {
            if(day.count > maxCount) {
                maxCount = day.count;
                $scope.active.maxDay = day.name;
            }
        });

        // Find the time of day with the highest count.
        maxCount = 0;
        times.forEach(function(time) {
            if(time.count > maxCount) {
                maxCount = time.count;
                $scope.active.maxTime = time.name;
            }
        });

        $scope.chart.render(hours);
    };

    $scope.handleChangeDateField = function() {
        $scope.functions.logChangeAndUpdate("dateField", $scope.active.dateField.columnName);
    };

    $scope.functions.hideHeaders = function() {
        return false;
    };

    $scope.functions.createExportDataObject = function(exportId, query) {
        var finalObject = {
            name: 'Ops_Clock',
            data: [{
                query: query,
                name: "circularHeatForm-" + exportId,
                fields: [],
                ignoreFilters: query.ignoreFilters_,
                selectionOnly: query.selectionOnly_,
                ignoredFilterIds: query.ignoredFilterIds_,
                type: "query"
            }]
        };
        finalObject.data[0].fields.push({
            query: 'day',
            pretty: 'Day'
        });
        finalObject.data[0].fields.push({
            query: 'hour',
            pretty: 'Hour'
        });
        finalObject.data[0].fields.push({
            query: 'count',
            pretty: 'Count'
        });
        return finalObject;
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.dateField = $scope.functions.isFieldValid($scope.active.dateField) ? $scope.active.dateField.columnName : undefined;
        return bindings;
    };
}]);
