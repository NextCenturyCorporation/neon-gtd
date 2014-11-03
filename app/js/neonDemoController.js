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
 * This provides a bare-bones controller for the primary portion of index.html, the main page of the
 * application.
 *
 * @class neonDemo.controllers.neonDemoController
 * @constructor
 */
angular.module('neonDemo.controllers', [])
.controller('neonDemoController', ['$scope', '$timeout', 'FilterCountService', function($scope, $timeout, filterCountService) {
    $scope.seeData = false;
    $scope.createFilters = false;
    $scope.chartOptions = false;
    $scope.filterCount = 0;

    $scope.gridsterOpts = {
        columns: 6, // the width of the grid, in columns
        pushing: true, // whether to push other items out of the way on move or resize
        floating: true, // whether to automatically float items up so they stack (you can temporarily disable if you are adding unsorted items with ng-repeat)
        width: 'auto', // can be an integer or 'auto'. 'auto' scales gridster to be the full width of its containing element
        colWidth: 'auto', // can be an integer or 'auto'.  'auto' uses the pixel width of the element divided by 'columns'
        rowHeight: 'match', // can be an integer or 'match'.  Match uses the colWidth, giving you square widgets.
        margins: [10, 10], // the pixel distance between each widget
        outerMargin: true, // whether margins apply to outer edges of the grid
        isMobile: false, // stacks the grid items if true
        mobileBreakPoint: 600, // if the screen is not wider that this, remove the grid layout and stack the items
        mobileModeEnabled: true, // whether or not to toggle mobile mode when screen width is less than mobileBreakPoint
        minColumns: 1, // the minimum columns the grid must have
        minRows: 2, // the minimum height of the grid, in rows
        maxRows: 100,
        defaultSizeX: 2, // the default width of a gridster item, if not specifed
        defaultSizeY: 2, // the default height of a gridster item, if not specified
        resizable: {
           enabled: true,
           //handles: ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'],
           handles: ['e', 's', 'w', 'ne', 'se', 'sw', 'nw'],
           start: function(event, $element, widget) {}, // optional callback fired when resize is started,
           resize: function(event, $element, widget) {}, // optional callback fired when item is resized,
           stop: function(event, $element, widget) {} // optional callback fired when item is finished resizing
        },
        draggable: {
           enabled: true, // whether dragging items is supported
           handle: '.visualization-drag-handle', // optional selector for draggable handle
           start: function(event, $element, widget) {}, // optional callback fired when drag is started,
           drag: function(event, $element, widget) {}, // optional callback fired when item is moved,
           stop: function(event, $element, widget) {} // optional callback fired when item is finished dragging
        }
    };

    $scope.visualizations = [{
        sizeX: 6,
        sizeY: 1,
        row: 0,
        col: 0,
        type: 'timeline-selector'
    },{
        sizeX: 6,
        sizeY: 2,
        row: 1,
        col: 0,
        type: 'heat-map'
    },{
        sizeX: 2,
        sizeY: 2,
        row: 3,
        col: 0,
        type: 'linechart',
        bindings: {
            "chart-type": "chartType"
        }
    },{
        sizeX: 2,
        sizeY: 2,
        row: 3,
        col: 2,
        type: 'barchart',
        bindings: {
            "attr-x": "xAxisField",
            "attr-y": "yAxisField",
            "bar-type": "barType"
        }
    },{
        sizeX: 2,
        sizeY: 2,
        row: 3,
        col: 4,
        type: 'circular-heat-form'
    },{
        sizeX: 6,
        sizeY: 2,
        row: 5,
        col: 0,
        type: 'tag-cloud',
        bindings: {
            "tag-field": "'hashtags'"
        }
    }];

    /**
     * Simple toggle method for tracking whether or not the create filters tray should be visible.
     * At present, this is used to sync an angular scope variable with the collapsed state of a div
     * whose visiblity is managed by Bootstrap hooks.
     * @method toggleCreateFilters
     */
    $scope.toggleCreateFilters = function() {
        $scope.createFilters = !$scope.createFilters;
        var action = (true === $scope.createFilters) ? 'show_custom_filters' : 'hide_custom_filters';
        XDATA.activityLogger.logUserActivity('Neon Demo - Toggle custom filter display', action,
            XDATA.activityLogger.WF_CREATE,
            {
                from: !$scope.createFilters,
                to: $scope.createFilters
            });

        if($scope.createFilters && $scope.seeData) {
            // using timeout here to execute a jquery event outside of apply().  This is necessary
            // to avoid the event occuring within an apply() cycle and triggering another
            // update which calls apply() since the side-effects of the click would change
            // things that are watched in index.html.
            $timeout(function() {
                $($("[href='.data-tray']")[0]).click();
            }, 5, false);
        }
    };

    /**
     * Simple toggle method for tracking whether or not the data table tray should be visible.
     * At present, this is used to sync an angular scope variable with the collapsed state of a div
     * whose visiblity is managed by Bootstrap hooks.
     * @method toggleSeeData
     */
    $scope.toggleSeeData = function() {
        $scope.seeData = !$scope.seeData;
        var action = (true === $scope.seeData) ? 'show_data_table' : 'hide_data_table';
        XDATA.activityLogger.logUserActivity('Neon Demo - Toggle data table display', action,
            XDATA.activityLogger.WF_CREATE,
            {
                from: !$scope.seeData,
                to: $scope.seeData
            });

        if($scope.createFilters && $scope.seeData) {
            // using timeout here to execute a jquery event outside of apply().  This is necessary
            // to avoid the event occuring within an apply() cycle and triggering another
            // update which calls apply() since the side-effects of the click would change
            // things that are watched in index.html.
            $timeout(function() {
                $($("[href='.filter-tray']")[0]).click();
            }, 5, false);
        }
    };

    /**
     * Simple toggle method for tracking which chart is visible.
     * @method toggleCreateFilters
     */
    $scope.toggleChartOptions = function() {
        $scope.chartOptions = !$scope.chartOptions;
        var action = (true === $scope.chartOptions) ? 'show_options' : 'hide_options';
        XDATA.activityLogger.logUserActivity('Neon Demo - Toggle chart options display', action,
            XDATA.activityLogger.WF_CREATE,
            {
                from: !$scope.chartOptions,
                to: $scope.chartOptions
            });
    };

    // Watch for changes in the filter counts and update the filter badge binding.
    $scope.$watch(function() {
        return filterCountService.getCount();
    }, function(count) {
        $scope.filterCount = count;
    });

    $scope.$watch('chartType', function(newVal, oldVal) {
        XDATA.activityLogger.logUserActivity('Neon Demo - Select chart type', 'select_plot_type',
            XDATA.activityLogger.WF_CREATE,
            {
                from: oldVal,
                to: newVal
            });
    }, true);

    $scope.$watch('barType', function(newVal, oldVal) {
        XDATA.activityLogger.logUserActivity('Neon Demo - Select chart aggregation type', 'define_axes',
            XDATA.activityLogger.WF_CREATE,
            {
                from: oldVal,
                to: newVal
            });
    }, true);
}]);