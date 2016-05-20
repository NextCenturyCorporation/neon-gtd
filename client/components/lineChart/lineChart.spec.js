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

describe('Chart: lineChart', function() {
    // load the necessary modules
    beforeEach(module('neonDemo'));

    var lineChartContainer;

    beforeEach(function() {
        lineChartContainer = angular.element('<div><div class="linechart"></div></div>');
    });

    it('draw() initializes HTML properly', function() {
        var opts = {
            data: [],
            x: "x_column",
            y: "y_column",
            responsive: false,
            granularity: "day",
            colorMappings: [],
            selectedKey: undefined
        };
        var chart = new charts.LineChart(lineChartContainer[0], ".linechart", opts);
        chart.draw([]);
        // Verify that the line chart added an element to the div
        expect(lineChartContainer.children().first().children().length).toBe(1);
    });

    it('draw() an empty series', function() {
        var opts = {
            data: [],
            x: "date",
            y: "value",
            responsive: false,
            granularity: "day",
            colorMappings: [],
            selectedKey: undefined
        };
        var chart = new charts.LineChart(lineChartContainer[0], ".linechart", opts);
        chart.draw([{
            aggregation: "count",
            count: 0,
            min: 1,
            max: 1,
            series: "a:group",
            total: 1,
            data: [{
                date: new Date("2005-02-04 14:00:00"),
                value: 1
            }]
        }]);
        // Verify that there are now two axis elements in the barchart
        expect(lineChartContainer.find(".axis").length).toBe(2);
    });

    it('tooltips escape HTML characters', function() {
        // Add the tooltip-container element. It is expected to be outside the chart's directive.
        $('body').append("<div id='tooltip-container'></div>");

        var opts = {
            data: [],
            x: "date",
            y: "value",
            responsive: false,
            granularity: "day",
            colorMappings: [],
            selectedKey: undefined
        };
        var chart = new charts.LineChart(lineChartContainer[0], ".linechart", opts);
        chart.draw([
            {
                aggregation: "count",
                count: 0,
                min: 1,
                max: 1,
                series: "a:foo:bar",
                total: 1,
                data: [{
                    date: new Date("2005-02-04 14:00:00"),
                    value: 1
                }]
            },
            {
                aggregation: "count",
                count: 0,
                min: 1,
                max: 1,
                series: "b:<b>this & that</b>",
                total: 2,
                data: [{
                    date: new Date("2005-02-04 14:00:00"),
                    value: 1
                }]
            }
        ]);
        // The chart will use this "mouse event" to place the tooltip
        d3.event = {
            pageY: 0,
            pageX: 0
        };
        chart.showTooltip(0,new Date("2005-02-04 14:00:00"));
        // Verify that there are now two axis elements in the barchart
        expect($('#tooltip-container').html()).toContain('foo:bar');
        expect($('#tooltip-container').html()).toContain('&lt;b&gt;this &amp; that&lt;/b&gt;');
    });
});
