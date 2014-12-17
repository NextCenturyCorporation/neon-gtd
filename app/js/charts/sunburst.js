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
 *
 * Creates a new bar chart component
 * @namespace charts
 * @class BarChart
 * @param {String} chartSelector The selector for the component in which the chart will be drawn
 * @param {Object} opts A collection of key/value pairs used for configuration parameters:
 * <ul>
 *     <li>data (required) - An array of data with the specified x-y data values (note the `y` is optional - see the
 *     description of the `y` parameter).</li>
 *     <li>x (required) - The name of the x-attribute or a function that takes 1 parameter (the current item)
 *     and returns the x value from the item. Note that all x-values must be of the same data type</li>
 *     <li>y (optional) - The name of the y-attribute. If not specified, each item will contribute 1 to the current count.</li>
 *     <li>xLabel (optional) - The label to show for the x-attribute (e.g. on tooltips). If not specified, this will
 *     default to using the name of the attribute specified in x (if x is a function, then the value "x" will be used).
 *     This is useful if the x-attribute name is not the same as how it should be displayed to users.</li>
 *     <li>yLabel (optional) - The label to show for the y-attribute (e.g. on tooltips). If not specified, this will
 *     default to using the name of the attribute specified in y (if no y value is specified, then the value "Count" will be used).
 *     This is useful if the y-attribute name is not the same as how it should be displayed to users.</li>
 *     <li>responsive (optional) - If true, the chart will size to the width and height of the parent html element containing the chart</li>
 *     <li>height (optional) - The height of the chart in pixels. If not specified, a preconfigured default value will be used.</li>
 *     <li>width (optional) - The width of the chart in pixels. This will be honored as closely as possible, while still allowing bar widths to be evenly drawn. If not specified, a preconfigured default value will be used.</li>
 *     <li>margin (optional) - An object with any of the elements `top`, `left`, `bottom` or `right`. These are pixel values to override the default margin. If not specified, a preconfigured default value will be used.</li>
 *     <li>style (optional) - a mapping of a bar state to the different attributes to style for that attribute. The available bar states
 *     are active (default bar state), inactive (a visual state to indicate to the user that the bar should be seen
 *     as inactive - the meaning of this is chart specified - see {{#crossLink "charts.BarChart/setInactive"}}{{/crossLink}}),
 *     and hover. The attributes that can be toggled correspond
 *     to the underlying svg type used to render the bar. For example, to modify the the active/inactive bar states,
 *     but not do anything on hover this attribute would be
 *     `{ "active" : { "fill" : "blue" }, "inactive" : { "fill" : "red" } }`. The values for the attributes can also be functions
 *     to compute the values. The function takes 2 parameters - the current data for the bar and its index.</li>
 *     <li>tickFormat (optional) - The format of the tick labels on the x-axis. Use the formatting specified by d3 at
 *     <a href="https://github.com/mbostock/d3/wiki/API-Reference">D3 API reference</a>. The actual d3 format object is
 *     required, not just the string to format it, such as `d3.format('04d')`. The type of formatting used
 *     will vary based on the axis values. If not specified, a preconfigured default value will be used.</li>
 *     <li>tickValues (optional) - A list of tick values to show on the chart. If not specified, all bars will be labeled</li>
 *     <li>categories (optional) - A list of values to use as the x-axis categories (bins). This can also be a function
 *     that takes 1 parameter (the data) and will compute the categories. If not specified, all unique values from the
 *     x-attribute will used as the category values</li>
 *     <li>init (optional) - An optional method for the bar chart to invoke before aggregating the data, but after setting
 *     up the x/y attributes. This allows callers to use the {{#crossLink "charts.BarChart/categoryForItem"}}{{/crossLink}})
 *     method to perform any preprocessing. This is useful because the bar chart will take the appropriate action to
 *     resolve the x attribute, which can be a string or a function.
 *     The init method is called with a single parameter containing the options passed into the bar chart.</li>

 * </ul>
 *
 * @constructor
 *
 * @example
 *    var data = [
 *    { "country": "US", "events": 9},
 *    { "country": "Japan", "events": 8},
 *    { "country": "China", "events": 2},
 *    { "country": "Japan", "events": 3},
 *    { "country": "US", "events": 1},
 *    { "country": "Canada", "events": 7}
 *    ];
 *    var el = $('#el');
 *    var opts = { "data": data, "x": "country", "y" : "events"};
 *    var sunburst = new charts.SunburstChart(el, '.chart', opts).draw();
 *
 */
charts.SunburstChart = function(rootElement, selector, opts) {
	opts = opts || {};
	this.chartSelector_ = selector;
	this.root = d3.select(rootElement);
	this.element = this.root.select(selector);

	this.width = opts.width || charts.SunburstChart.DEFAULT_WIDTH;
	this.height = opts.height || charts.SunburstChart.DEFAULT_HEIGHT;

	this.radius = Math.min(this.width - 20, this.height - 20) / 2;

	this.x = d3.scale.linear()
		.range([0, 2 * Math.PI]);

	this.y = d3.scale.linear()
		.range([0, this.radius]);

	this.color = d3.scale.category20c();

	this.countFormatter = d3.format(' ,.0f');

	this.moneyFormatter = d3.format(' $,.2f');
	this.partitionValue = "count";
};

charts.SunburstChart.DEFAULT_HEIGHT = 500;
charts.SunburstChart.DEFAULT_WIDTH = 500;

charts.SunburstChart.prototype.drawBlank = function() {
	var me = this;
	this.svg = me.element.append("svg")
		.attr("width", this.width)
		.attr("height", this.height)
		.append("g")
		.attr("transform", "translate(" + this.width / 2 + "," + (this.height / 2 + 10) + ")");

	this.partition = d3.layout.partition()
		.sort(null)
		.value(function(d) {
			return d[me.partitionValue];
		});

	this.arc = d3.svg.arc()
		.startAngle(function(d) {
			return Math.max(0, Math.min(2 * Math.PI, me.x(d.x)));
		})
		.endAngle(function(d) {
			return Math.max(0, Math.min(2 * Math.PI, me.x(d.x + d.dx)));
		})
		.innerRadius(function(d) {
			return Math.max(0, me.y(d.y));
		})
		.outerRadius(function(d) {
			return Math.max(0, me.y(d.y + d.dy));
		});
};

charts.SunburstChart.prototype.drawData = function(root) {
	var me = this;
	// Keep track of the node that is currentfoly being displayed as the root.
	var node;

	node = root;

	var path = this.svg.datum(root).selectAll("path")
		.data(this.partition.nodes)
		.enter().append("path")
			.attr("d", this.arc)
			.style("fill", function(d) {
				return me.color((d.children ? d : d.parent).name);
			})
			.on("click", click)
			.on("mouseover", onMouseOver)
			.on("mouseout", onMouseOut)
			.on("mousemove", onMouseMove)
			.each(stash);

	me.root.selectAll("input.sunburst-chart-selector").on("change", function change() {
		var element = me.root.select('input.sunburst-chart-selector:checked')[0];
		var value = element[0].value;
		if(value === "count") {
			me.partitionValue = "count";
			value = function(d) {
				return d.count;
			};
		} else {
			me.partitionValue = "total";
			value = function(d) {
				return d.total;
			};
		}

		path
		.data(me.partition.value(value).nodes)
		.transition()
		.duration(1000)
		.attrTween("d", arcTweenData);
	});

	// When switching data: interpolate the arcs in data space.
	function arcTweenData(a, i) {
		var oi = d3.interpolate({
			x: a.x0,
			dx: a.dx0
		}, a);
		function tween(t) {
			var b = oi(t);
			a.x0 = b.x;
			a.dx0 = b.dx;
			return me.arc(b);
		}
		if(i === 0) {
			// If we are on the first arc, adjust the x domain to match the root node
			// at the current zoom level. (We only need to do this once.)
			var xd = d3.interpolate(me.x.domain(), [node.x, node.x + node.dx]);
			return function(t) {
				me.x.domain(xd(t));
				return tween(t);
			};
		} else {
			return tween;
		}
	}

	function click(d) {
		node = d;
		path.transition()
			.duration(1000)
			.attrTween("d", arcTweenZoom(d));
	}

	function onMouseOver(d, i) {
		var tooltip = d3.select(".sunburst-tooltip");
		var text = "<span class='sunburst-tooltip-title'>" + d.name + "</span><br>";
		text = (!d.count && !d.total && d.value) ? text + "<span class='sunburst-tooltip-field'>Aggregate:</span> " + me.countFormatter(d.value) + "<br>" : text;
		text = (d.count) ? text + "<span class='sunburst-tooltip-field'>Count:</span> " + me.countFormatter(d.count) + "<br>" : text;
		text = (d.total) ? text + "<span class='sunburst-tooltip-field'>Amount:</span> " + me.moneyFormatter(d.total) + "<br>" : text;

		tooltip.html(text);
		// tooltip.transition()
		//   .duration(200)
		tooltip.style("opacity", 0.9);
		tooltip.style("left", d3.event.offsetX + "px")
			.style("top", d3.event.offsetY + "px");
	}

	function onMouseMove() {
		var tooltip = d3.select(".sunburst-tooltip");
		tooltip.style("left", d3.event.offsetX + "px")
			.style("top", d3.event.offsetY + "px");
	}

	function onMouseOut() {
		var tooltip = d3.select(".sunburst-tooltip");
		// tooltip.transition()
		//   .duration(200)
		tooltip.style("opacity", 0);
	}

	d3.select(window.frameElement).style("height", this.height + "px");

	// Setup for switching data: stash the old values for transition.
	function stash(d) {
		d.x0 = d.x;
		d.dx0 = d.dx;
	}

	// When zooming: interpolate the scales.
	function arcTweenZoom(d) {
		var xd = d3.interpolate(me.x.domain(), [d.x, d.x + d.dx]);
		var yd = d3.interpolate(me.y.domain(), [d.y, 1]);
		var yr = d3.interpolate(me.y.range(), [d.y ? 20 : 0, me.radius]);
		return function(d, i) {
			if(i) {
				return function() {
					return me.arc(d);
				};
			} else {
				return function(t) {
					me.x.domain(xd(t));
					me.y.domain(yd(t)).range(yr(t));
					return me.arc(d);
				};
			}
		};
	}

	function computeTextRotation(d) {
		return (this.x(d.x + d.dx / 2) - Math.PI / 2) / Math.PI * 180;
	}
};

charts.SunburstChart.prototype.clearData = function() {
	//clear
	$(this.element[0]).empty();
	//draw blank
	this.drawBlank();
};
