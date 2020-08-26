/* monitor.js
 *
 * This is the main source file for the OCS monitoring and control web
 * interface.  The interface is presented as a series of tabs,
 * including a main "Browser" tab that can be used to browse through
 * all Agents and to launch specialized Agent control tabs.
 *
 * The coding style in monitor_ui.js and the Agent UI scripts is to be
 * preferred to the style you'll find here.
 */


/* Shared globals needed for all plugins */
var ocs_connection;
var debugs = {};
var tabman = new TabManager();

// Timer for querying Operation status.
var query_op_timer = null;

/* feed_view is a string: 'data', or 'feed'.  It determines whether
 * the feed window should be used to display session.data info or a
 * subscribed feed. */
var feed_view = null;


/* log(msg)
 *
 * This function must always me available, even if it does nothing.
 */

function log(msg) {
    var log = $("#messages");
    log.html(log.html() + msg + '<br>');
    log.scrollTop(log[0].scrollHeight - log.height());
}
ocs_log = log;

function create_hider(clickable_id, hideable_id, show_text, hide_text, hide_it) {
    
    var elem = $(clickable_id).on('click', function () {
        if ($(hideable_id).toggle().is(':visible'))
            $(clickable_id).html(hide_text);
        else
            $(clickable_id).html(show_text);
    });
    if (hide_it) {
        $(hideable_id).toggle();
        elem.html(show_text);
    } else
        elem.html(hide_text);
    return elem;
}

function init() {
    $(document).ready(function() {
        log('Page init function is running...');
        log('Autobahn version:', autobahn.version);

        // Tab setup.
        tabs = $('#tabs').tabs();

        // Set up defaults -- these could be fed from elsewhere... ?
        $('#wamp_router').val('ws://localhost:8001/ws');
        $('#wamp_realm').val('test_realm');
        $('#target_agent').val('');

        // Hiders.
        create_hider('#connection_form_table_toggle',
                     '#connection_form_table',
                     ' [show]', ' [hide]', false).addClass('clickable');
        create_hider('#messages_hider',
                     '#messages',
                     ' [show]', ' [hide]', true).addClass('clickable');

        // Set up the global OCS connector and assign handlers.
        ocs_connection = new OCSConnection(
            function () { return $('#wamp_router').val(); },
            function () { return $('#wamp_realm').val(); });
        //ocs_connection.on('connected', function () { $('#connection_checkmark').html(' &#10003;'); });
        ocs_connection.on('connected', () => $('#connection_checkmark').html(' &#10003;'));
        ocs_connection.on('disconnected', () => $('#connection_checkmark').html(' &#10005;'));
        ocs_connection.on('try_connect', () => $('#connection_checkmark').html(' &#10067;'));

        // Begin connection attempts.
        ocs_connection.start();

        // For debugging you can create and activate a tab like this.
        //tab_info = tabman.add('faker-1', 'FakeDataAgent',
        //                      {address: 'observatory.faker-1'});
        //tabman.activate(tab_info.base_id);
    });
}

/** AgentList
 *
 *  For maintaining the list of active Agents; uses heartbeat feed(s)
 *  to keep list up-to-date.
 */

function AgentList () {
    this.agent_list = [];
}

AgentList.prototype = {
    update_agent_info: function(info) {
        var addr = info.agent_address;
        if (!this.agent_list.includes(addr)) {
            this.agent_list.push(addr);
            this.agent_list.sort();
            var table = $('<table width="100%">');
            //table.append($('<tr><td class="data_h">Agents</td></tr>'));
            this.agent_list.forEach(function (x) {
                link = $('<span class="clickable">' + x + '</span>').on(
                    'click', function () {
                        $('#target_agent').val(x);
                        query_agent();
                    });
                but1 = $('<span>').append('<i class="fa fa-plus">').on(
                    'click', function () {
                        tabman.add(x, null, {address: x});
                    }).addClass('obviously_clickable');
                but2 = $('<span>').append('<i class="fa fa-arrow-up">').on(
                    'click', function () {
                        var tab_info = tabman.add(x, null, {address: x});
                        tabman.activate(tab_info.base_id);
                    }).addClass('obviously_clickable');
                table.append($('<tr>')
                             .append($('<td class="data_1">').append(link))
                             .append($('<td class="data_1">').append(but1).append(but2))
                            );
                debugs['x'] = link;
            });
            var dump = $('#agent_list').html('').append(table).append('<br>');
        }
    }
}

/* Interface attachments. */

function reconnect() {
    ocs_connection.connect();
}

function query_agent() {
    // Requests the Agent's interface (Operations and Feeds), using
    // AgentClient.scan.  The results are loaded into the "Interface"
    // window.

    if (ocs_connection == null) return;
    agent_addr = $('#target_agent').val();
    client = new AgentClient(ocs_connection.connection, agent_addr);

    client.scan(function () {
        log('Client scan completed.');
        var summary = $('<table width=100%>');
        $('#target_op').val('');
        
        summary.append($('<tr><td class="data_h" colspan=2>Processes</td></tr>'));
        client.procs.forEach(function (x) {
            var link = $('<span class="clickable">' + x[0] + '</span>');
            link.on('click', function () {
                $('#target_op').val(x[0]);
                query_op(true);
            });
            var indicator = $('<span class="op_status">' + x[1].status + '</span>');
            summary.append($('<tr>')
                           .append(($('<td class="data_1a">').append(link)))
                           .append($('<td class="data_1b">').append(indicator)));
        });
        summary.append($('<tr><td class="data_h" colspan=2>Tasks</td></tr>'));
        client.tasks.forEach(function (x) {
            var link = $('<span class="clickable">' + x[0] + '</span>');
            link.on('click', function () {
                $('#target_op').val(x[0]);
                query_op(true);
            });
            var indicator = $('<span class="op_status">' + x[1].status + '</span>');
            summary.append($('<tr>')
                           .append(($('<td class="data_1a">').append(link)))
                           .append($('<td class="data_1b">').append(indicator)));
        });
        summary.append($('<tr>').append($('<td class="data_h" colspan=2>').append('Feeds')));//</td></tr>'));
        client.feeds.forEach(function (x) {
            var link = $('<span class="clickable">' + x[0] + '</span>');
            link.on('click', function () {
                $('#target_feed').val(x[0]);
                subscribe_feed();
            });
            summary.append($('<tr>').append(($('<td class="data_1">').append(link))));
        });
        $('#interface_summary').html('').append(summary);
    });
    debugs['client'] = client;

    var msgh = new MessageBuffer();
    msgh.callback = function () {
        text = '';
        for (i=Math.max(0, this.messages.length - 10); i < this.messages.length; i++) {
            timestr = get_date_time_string(this.messages[i][0], ' ');
            text += timestr + ' ' + this.messages[i][1] + '<br>\n';
        }
        $('#status_tasks').html(text);
        log("Now there are " + this.messages.length + " messages.");
    };
}

function query_op(reset_query) {
    // Request the status of a particular Operation from a particular
    // Agent.  If reset_query, then the display area is cleared before
    // the request goes out... otherwise, it is left as-is so it won't
    // flicker if the data have not changed.

    if (ocs_connection == null) return;
    agent_addr = $('#target_agent').val();
    agent_op = $('#target_op').val();

    var query_op_valid = (agent_addr && agent_op);
    if (!query_op_valid ||  reset_query)
        $('#op_status').empty();

    if (!query_op_valid)
        return;
        
    client = new AgentClient(ocs_connection.connection, agent_addr);
    //$('#op_status_legend').html('Op Session Info');

    client.status(agent_op).then(function (args, kwargs) {

        debugs['status'] = args;
        var data = args[2]; // The first two args are, like, [0, "Session active."].

        var timestr = get_date_time_string(null, ' ');
        var text = '<b>' + client.address + '.ops.' + agent_op + ' @ ' +
            timestr + '</b><br>\n';
        
        var out = $('<div>');
        fmt_pair = function(k, v) {
            k = k + '&nbsp;'.repeat(Math.max(0,10 - k.length));
            return k + ' ' + v + '<br>\n';
        };
        fmt_time = function(t) {
            if (!t)
                return '(null)';
            return t.toFixed(3) + ' ' + get_date_time_string(t, ' ');
        };

        out.append(text);

        if (feed_view == 'data') {
            data_text = 'displayed';
        } else {
            data_text = '<span id="op_data_clicko">click to view</span>';
        }
        out.append(fmt_pair('Op Name:', data.op_name) +
                   fmt_pair('Status:', data.status) +
                   fmt_pair('Started:', fmt_time(data.start_time)) +
                   fmt_pair('Ended:', fmt_time(data.end_time)) +
                   fmt_pair('Data:', data_text));

        if (feed_view == 'data') {
            $('#feed_monitor_legend').html('Data: ' + data.op_name);
            var timestr = get_date_time_string(null, ' ');
            var text = '<b>update at @ ' + timestr +
                '</b><br>\n' +
                '<p>' + JSON.stringify(data.data) +'</p>';
            $('#feed_monitor').html(text);
        }

        out.append('Messages:<br>\n');
        msgs = $('<div class="autopop_border">');
        if (data.messages)
            data.messages.forEach(function (msg) {
                timestr = get_date_time_string(msg[0], ' ');
                msgs.append('<p class="hanging_logmsg">' + timestr + ': ' + msg[1] + '</p>');
            });
        out.append(msgs);

        $('#op_status').empty().append(out);
        $('#op_data_clicko').addClass("clickable").on('click', connect_data);

        // Poll for updates.
        if (query_op_timer)
            clearTimeout(query_op_timer);
        query_op_timer = setTimeout(function () { query_op(false); }, 2000);

    });
}

function subscribe_feed() {
    feed_view = 'feed';
    if (ocs_connection == null) return;

    var agent_addr = $('#target_agent').val();
    var feed_id = $('#target_feed').val();
    if (!(agent_addr && feed_id))
        return;

    var feed_to_monitor = agent_addr + '.feeds.' + feed_id;
    $('#feed_monitor_legend').html('Feed: ' + feed_to_monitor);
    ocs_connection.set_feed(feed_to_monitor,
                            function (args, kwargs, details) {
                                if (feed_view != 'feed') return;
                                if (args == null) {
                                    $('#feed_monitor').html('(Cleared on connection reset.)');
                                    return;
                                }
                                var timestr = get_date_time_string(null, ' ');
                                var text = '<b>' + feed_to_monitor + ' @ ' + timestr +
                                    '</b><br>\n' +
                                    '<p>' + JSON.stringify(args[0]) +'</p>';
                                $('#feed_monitor').html(text);
                            });
}

function connect_data() {
    feed_view = 'data';
}
